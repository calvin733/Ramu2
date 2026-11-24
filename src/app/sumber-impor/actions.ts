"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isoDate, normalizeSales, verifyMapping } from "@/domain/import-sales";
import { suggestImportCorrection } from "@/domain/import-guidance";
import {
  answerReading,
  understandSales,
  rememberedReading,
  recommendSalesTabs,
} from "@/server/import/assistant";
import {
  ImportError,
  maxFileBytes,
  type ImportManagement,
  type ImportMapping,
} from "@/domain/import-types";
import { requireBusiness, uuidPattern } from "@/server/account";
import { readCsv } from "@/server/import/csv";
import {
  openGoogleSpreadsheet,
  sheetHeaderKey,
  SheetsAccessError,
} from "@/server/import/google-sheets";
import { openXlsx } from "@/server/import/xlsx";
import { activeRevision, type SalesRevision } from "@/server/sales-revisions";
import { supabaseRequest } from "@/server/supabase-http";

async function openFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new ImportError(
      "Pilih file Excel atau CSV yang berisi catatan penjualan.",
    );
  if (file.size > maxFileBytes)
    throw new ImportError("Ukuran file maksimal 2 MB.");
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension !== "csv" && extension !== "xlsx")
    throw new ImportError("Gunakan format .xlsx atau .csv.");
  const binary = Buffer.from(await file.arrayBuffer());
  const filename = file.name
    .replace(/[\u0000-\u001f/\\]/g, " ")
    .trim()
    .slice(0, 180);
  if (extension === "csv") {
    const table = readCsv(binary);
    return { filename, kind: extension, tabs: [], read: () => table };
  }
  const workbook = openXlsx(binary);
  return {
    filename,
    kind: extension,
    tabs: workbook.names.map((name, id) => ({ name, id })),
    read: workbook.read,
  };
}

function checkUpdate(previous: SalesRevision | null, form: FormData) {
  if (!previous || previous.source.paused_at)
    throw new ImportError("Aktifkan kembali sumber untuk memperbarui data.");
  if (previous.source.kind !== "google_sheets") {
    if (form.get("kind") === "google_sheets")
      throw new ImportError(
        "Gunakan Ganti sumber untuk berpindah ke Google Sheets.",
      );
    return;
  }
  if (
    form.get("kind") !== "google_sheets" ||
    form.get("spreadsheet") !== previous.source.spreadsheet_id ||
    form.get("sheet") !== String(previous.source.sheet_id)
  )
    throw new ImportError(
      "Pembaruan harus memakai spreadsheet dan tab yang sama. Gunakan Ganti sumber untuk memilih sumber lain.",
    );
}

async function openImport(form: FormData) {
  if (form.get("kind") === "google_sheets")
    return openGoogleSpreadsheet(
      form.get("accessToken"),
      form.get("spreadsheet"),
    );
  return openFile(form);
}

function selectedTab(form: FormData, defaultId: number) {
  const value = form.get("sheet");
  if (value === null) return defaultId;
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value))
    throw new ImportError("Pilih tab penjualan yang tersedia.");
  return Number(value);
}

export async function inspectImport(
  form: FormData,
  management?: ImportManagement,
  reply?: { ticket: string; choice?: number; text?: string },
) {
  const { business } = await requireBusiness();
  try {
    if (management && management.revision !== business.active_revision_id)
      throw new ImportError(
        "Sumber aktif berubah. Muat ulang halaman sebelum mengimpor.",
      );
    const previous =
      management?.operation === "update" ? await activeRevision() : null;
    if (management?.operation === "update") checkUpdate(previous, form);
    const file = await openImport(form);
    let recommended: number | undefined;
    if (file.tabs.length > 1 && !form.has("sheet")) {
      const advice =
        "peekHeaders" in file
          ? await recommendSalesTabs(await file.peekHeaders(), business.id, [
              business.name,
            ])
          : { suggested: [], automatic: undefined };
      if (advice.automatic === undefined)
        return { tabs: file.tabs, suggestedTabs: advice.suggested };
      recommended = advice.automatic;
    }
    const sheet = selectedTab(form, recommended ?? file.tabs[0]?.id ?? 0);
    const { headers, rows } = await file.read(sheet);
    const context = {
      business: business.id,
      timezone: business.timezone,
      source: JSON.stringify([
        file.kind,
        file.filename,
        sheet,
        "spreadsheetId" in file ? file.spreadsheetId : null,
      ]),
      privateNames: [business.name],
    };
    const analysis = reply
      ? await answerReading({ headers, rows }, context, reply.ticket, {
          choice: reply.choice,
          text: reply.text,
        })
      : previous?.mapping.headerKey === sheetHeaderKey(headers)
        ? rememberedReading(
            { headers, rows },
            previous.mapping as ImportMapping,
            context,
          )
        : await understandSales({ headers, rows }, context);
    return {
      sampleRows: rows.slice(0, 2).map((row) => ({
        number: row.number,
        cells: headers.map((_, index) => (row.cells[index] ?? "").slice(0, 80)),
      })),
      columns: headers.map((label, index) => ({
        label,
        sample: (
          rows.find(({ cells }) => cells[index]?.trim())?.cells[index] ?? ""
        ).slice(0, 80),
      })),
      tabs: file.tabs,
      headerKey: sheetHeaderKey(headers),
      mapping: analysis.mapping,
      guidance: analysis.guidance,
      reading: analysis.reading,
      sheet,
    };
  } catch (error) {
    return {
      error: message(error, "File belum dapat dibaca. Coba pilih kembali."),
      reconnect: error instanceof SheetsAccessError,
    };
  }
}

function message(error: unknown, fallback: string) {
  return error instanceof ImportError ? error.message : fallback;
}

export async function previewImport(
  form: FormData,
  selectedMapping: unknown,
  coverage?: { from: string; through: string },
  management?: ImportManagement,
) {
  const { account, business } = await requireBusiness();
  try {
    if (management && management.revision !== business.active_revision_id)
      return {
        error: "Sumber aktif berubah. Muat ulang halaman sebelum mengimpor.",
      };
    const previous = await activeRevision();
    if (management?.operation === "update") checkUpdate(previous, form);
    const file = await openImport(form);
    if (management?.operation === "update") {
      if (file.kind !== previous?.source.kind)
        return {
          error:
            "Format file berbeda dari sumber aktif. Gunakan Ganti sumber untuk berpindah format.",
        };
    }
    const sheet = selectedTab(form, file.tabs[0]?.id ?? 0);
    const table = await file.read(sheet);
    if (
      "spreadsheetId" in file &&
      form.get("headerKey") !== sheetHeaderKey(table.headers)
    )
      throw new ImportError(
        "Judul atau urutan kolom berubah. Kembali ke pemilihan tab dan periksa pemetaan lagi.",
      );
    const mapping = verifyMapping(selectedMapping, table.headers.length);
    const result = normalizeSales(table, mapping, business.timezone);
    if (result.issues.length)
      return {
        issues: result.issues.slice(0, 10),
        issueCount: result.issues.length,
        correction: suggestImportCorrection(table, mapping, business.timezone),
      };
    if (!result.facts.length)
      return {
        error: "Belum ada transaksi sah atau retur yang dapat diimpor.",
      };
    const from = coverage?.from || result.from;
    const through = coverage?.through || result.through;
    if (
      !isoDate(from) ||
      !isoDate(through) ||
      from > result.from ||
      through < result.through
    )
      return {
        error:
          "Periode cakupan harus mencakup seluruh tanggal transaksi yang dihitung.",
      };

    const run = randomUUID();
    const payload = {
      name: file.filename,
      kind: file.kind,
      sheet: file.tabs.find(({ id }) => id === sheet)?.name ?? null,
      ...("spreadsheetId" in file
        ? { spreadsheetId: file.spreadsheetId, sheetId: sheet }
        : {}),
      from,
      through,
      sales: result.sales,
      orders: result.orders,
      products: result.products,
      basis: mapping.basis,
      timezone: business.timezone,
      operation: management?.operation === "update" ? "update" : "replace",
      mapping: { ...mapping, headerKey: sheetHeaderKey(table.headers) },
      facts: result.facts,
    };
    const response = await supabaseRequest("/rest/v1/rpc/ramu_stage_import", {
      method: "POST",
      admin: true,
      body: JSON.stringify({
        p_owner: account.id,
        p_business: business.id,
        p_base: business.active_revision_id,
        p_run: run,
        p_payload: payload,
      }),
    });
    if (response.status === 409)
      return {
        error:
          "Sumber aktif berubah. Muat ulang halaman dan periksa sumber kembali.",
      };
    if (!response.ok) throw new Error("Pratinjau gagal disimpan.");
    return {
      preview: {
        id: run,
        name: payload.name,
        from,
        through,
        dataFrom: result.from,
        dataThrough: result.through,
        sales: result.sales,
        orders: result.orders,
        products: result.products,
        rows: result.facts.length,
        skipped: result.skipped,
        previousCoverage:
          previous &&
          (from > previous.covered_from || through < previous.covered_through)
            ? { from: previous.covered_from, through: previous.covered_through }
            : null,
      },
    };
  } catch (error) {
    return {
      error: message(error, "Pratinjau belum dapat dibuat. Coba lagi."),
      reconnect: error instanceof SheetsAccessError,
    };
  }
}

export async function cancelImport(id: string) {
  const { account, business } = await requireBusiness();
  if (!uuidPattern.test(id)) return { error: "Pratinjau tidak tersedia." };
  try {
    const response = await supabaseRequest("/rest/v1/rpc/ramu_cancel_import", {
      admin: true,
      method: "POST",
      body: JSON.stringify({
        p_owner: account.id,
        p_business: business.id,
        p_run: id,
      }),
    });
    if (!response.ok) throw new Error("Pratinjau gagal dibatalkan.");
    return { cancelled: true };
  } catch {
    return { error: "Pratinjau belum dapat dibatalkan. Coba lagi." };
  }
}

export async function activateImport(
  id: string,
  acceptReducedCoverage: boolean,
) {
  const { account, business } = await requireBusiness();
  if (!uuidPattern.test(id)) return { error: "Pratinjau tidak tersedia." };
  try {
    const response = await supabaseRequest(
      "/rest/v1/rpc/ramu_activate_import",
      {
        admin: true,
        method: "POST",
        body: JSON.stringify({
          p_owner: account.id,
          p_business: business.id,
          p_run: id,
          p_accept_reduced_coverage: acceptReducedCoverage === true,
        }),
      },
    );
    if (response.status === 409)
      return {
        error:
          "Sumber aktif sudah berubah. Muat ulang halaman untuk memeriksa data kembali.",
      };
    if (response.status === 404 || response.status === 410)
      return {
        error: "Pratinjau sudah tidak tersedia. Periksa sumber kembali.",
      };
    if (response.status === 423)
      return {
        error:
          "Sumber dinonaktifkan. Aktifkan kembali untuk melanjutkan pembaruan.",
      };
    if (response.status === 422)
      return {
        error: "Konfirmasi pengurangan cakupan untuk mengganti sumber.",
      };
    if (!response.ok) throw new Error("Aktivasi gagal.");
    const revision = await response.json();
    if (typeof revision !== "string" || !uuidPattern.test(revision))
      throw new Error("Revisi belum tersedia.");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/harian");
    revalidatePath("/dashboard/produk");
    revalidatePath("/asisten");
    revalidatePath("/sumber-data");
    revalidatePath("/sumber-data/kelola");
    return { revision };
  } catch {
    return {
      error: "Sumber belum terkonfirmasi. Coba kembali dengan pratinjau ini.",
    };
  }
}
