import { createHash } from "node:crypto";
import {
  ImportError,
  maxColumns,
  maxFileBytes,
  maxRows,
  salesSheet,
  type ImportTab,
  type SalesSheet,
  type SheetsPickerConfig,
} from "../../domain/import-types.ts";

const spreadsheetPattern = /^[A-Za-z0-9_-]{10,200}$/;
const tokenPattern = /^[A-Za-z0-9._~+\/=-]{1,4096}$/;
const connectionMessage =
  "Akses Google Sheets berakhir atau belum diberikan. Hubungkan ulang dengan akun yang dapat membuka spreadsheet.";

export function googleSheetsConfig(): SheetsPickerConfig | null {
  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID?.trim() ?? "";
  const developerKey = process.env.GOOGLE_SHEETS_PICKER_KEY?.trim() ?? "";
  const projectNumber = process.env.GOOGLE_SHEETS_PROJECT_NUMBER?.trim() ?? "";
  return /^[A-Za-z0-9.-]+\.apps\.googleusercontent\.com$/.test(clientId) &&
    /^[A-Za-z0-9_-]{10,200}$/.test(developerKey) &&
    /^\d{1,20}$/.test(projectNumber)
    ? { clientId, developerKey, projectNumber }
    : null;
}

export class SheetsAccessError extends ImportError {}

async function readLimitedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ImportError("Google Sheets mengirim respons kosong.");
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxFileBytes) {
        await reader.cancel();
        throw new ImportError(
          "Ukuran data dari tab Google Sheets melebihi 2 MB. Kurangi cakupan tab sebelum mengimpor.",
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } finally {
    reader.releaseLock();
  }
}

async function sheetsJson(path: string, token: string, body?: object) {
  try {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/" + path;
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      method: body ? "POST" : "GET",
      headers: body
        ? {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          }
        : { Authorization: "Bearer " + token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403)
      throw new SheetsAccessError(connectionMessage);
    if (response.status === 404)
      throw new SheetsAccessError(
        "Spreadsheet tidak ditemukan atau aksesnya berubah. Hubungkan ulang atau pilih sumber lain.",
      );
    if (!response.ok)
      throw new ImportError("Google Sheets belum dapat dibaca. Coba lagi.");
    return await readLimitedJson(response);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("Google Sheets belum dapat dihubungi. Coba lagi.");
  }
}

export function sheetFromGoogle(values: unknown): SalesSheet {
  if (!Array.isArray(values) || values.length > maxRows + 1)
    throw new ImportError(
      "Gunakan maksimal 5.000 baris data pada tab penjualan.",
    );
  const rows = values.flatMap((row, index) => {
    if (!Array.isArray(row) || row.length > maxColumns)
      throw new ImportError("Gunakan maksimal 80 kolom pada tab penjualan.");
    const cells = row.map((value) => {
      if (value === null) return "";
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        return String(value);
      throw new ImportError("Ada nilai sel yang tidak dapat dibaca.");
    });
    return cells.some((value) => value.trim())
      ? [{ number: index + 1, cells }]
      : [];
  });
  return salesSheet(rows);
}

export function sheetHeaderKey(headers: string[]) {
  return createHash("sha256").update(JSON.stringify(headers)).digest("hex");
}

export async function openGoogleSpreadsheet(
  token: unknown,
  spreadsheetId: unknown,
) {
  if (!googleSheetsConfig())
    throw new ImportError("Google Sheets belum dikonfigurasi di RAMU.");
  if (typeof token !== "string" || !tokenPattern.test(token))
    throw new SheetsAccessError(connectionMessage);
  if (
    typeof spreadsheetId !== "string" ||
    !spreadsheetPattern.test(spreadsheetId)
  )
    throw new ImportError("Pilih spreadsheet melalui Google Picker.");

  const query = new URLSearchParams({
    fields:
      "properties(title),sheets(properties(sheetId,title,hidden,sheetType,gridProperties(rowCount)))",
  });
  const metadata = (await sheetsJson(spreadsheetId + "?" + query, token)) as {
    properties?: { title?: string };
    sheets?: {
      properties?: {
        sheetId?: number;
        title?: string;
        sheetType?: string;
        hidden?: boolean;
        gridProperties?: { rowCount?: number };
      };
    }[];
  };
  const tabs: ImportTab[] = (metadata.sheets ?? []).flatMap(
    ({ properties }) => {
      if (!properties || properties.hidden || properties.sheetType !== "GRID")
        return [];
      const { sheetId, title } = properties;
      return typeof sheetId === "number" &&
        Number.isInteger(sheetId) &&
        sheetId >= 0 &&
        typeof title === "string" &&
        title.trim()
        ? [{ id: sheetId, name: title }]
        : [];
    },
  );
  if (!tabs.length)
    throw new ImportError(
      "Spreadsheet belum memiliki tab data yang bisa dipilih.",
    );
  const filename =
    metadata.properties?.title?.trim().slice(0, 180) || "Spreadsheet Google";
  return {
    filename,
    kind: "google_sheets" as const,
    tabs,
    spreadsheetId,
    async peekHeaders() {
      if (tabs.length > 60) return [];
      const data = (await sheetsJson(
        spreadsheetId + "/values:batchGetByDataFilter",
        token,
        {
          dataFilters: tabs.map((tab) => ({
            gridRange: {
              sheetId: tab.id,
              startRowIndex: 0,
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: 80,
            },
          })),
          majorDimension: "ROWS",
          valueRenderOption: "FORMATTED_VALUE",
        },
      )) as {
        valueRanges?: {
          dataFilters?: { gridRange?: { sheetId?: number } }[];
          valueRange?: { values?: unknown[][] };
        }[];
      };
      return tabs.map((tab, index) => {
        const range =
          data.valueRanges?.find((range) =>
            range.dataFilters?.some(
              (filter) => filter.gridRange?.sheetId === tab.id,
            ),
          ) ?? data.valueRanges?.[index];
        const header = range?.valueRange?.values?.find(
          (row) =>
            Array.isArray(row) &&
            row.some((value) => String(value ?? "").trim()),
        );
        return {
          ...tab,
          headers: (header ?? [])
            .slice(0, 80)
            .map((value) => String(value ?? "").slice(0, 120)),
          rows: metadata.sheets?.find((s) => s.properties?.sheetId === tab.id)
            ?.properties?.gridProperties?.rowCount,
        };
      });
    },
    async read(sheetId: number) {
      if (!tabs.some(({ id }) => id === sheetId))
        throw new ImportError(
          "Tab sumber tidak tersedia. Pilih kembali tab atau ganti sumber.",
        );
      const data = (await sheetsJson(
        spreadsheetId + "/values:batchGetByDataFilter",
        token,
        {
          dataFilters: [{ gridRange: { sheetId } }],
          majorDimension: "ROWS",
          valueRenderOption: "FORMATTED_VALUE",
        },
      )) as { valueRanges?: { valueRange?: { values?: unknown } }[] };
      return sheetFromGoogle(data.valueRanges?.[0]?.valueRange?.values ?? []);
    },
  };
}
