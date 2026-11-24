export const maxFileBytes = 2 * 1024 * 1024;
export const maxRows = 5_000;
export const maxColumns = 80;

export type SourceKind = "csv" | "xlsx" | "google_sheets";
export type ImportManagement = {
  operation: "update" | "replace";
  revision: string;
};
export type GoogleSheetRef = { spreadsheetId: string; sheetId: number };
export type SheetsPickerConfig = {
  clientId: string;
  developerKey: string;
  projectNumber: string;
};
export type ImportTab = { id: number; name: string };

export type SalesSheet = {
  headers: string[];
  rows: { number: number; cells: string[] }[];
};
export type ImportMapping = {
  date: number;
  revenue: number;
  order: number;
  product: number;
  status: number;
  quantity: number;
  basis: "line" | "order" | "unit";
  dateFormat: "dmy" | "mdy" | "iso";
  moneyFormat: "id" | "en";
  validOnly: boolean;
  multiItem: boolean;
  headerKey?: string;
  statusValues?: Record<
    string,
    "completed" | "pending" | "cancelled" | "refunded"
  >;
};
export type ImportIssue = { row: number; message: string };
export type ImportFact = {
  row: number;
  date: string;
  occurred_at: string | null;
  order_id: string | null;
  product: string | null;
  quantity: number | null;
  status: "completed" | "refunded";
  revenue: number;
  product_revenue: number | null;
};

export class ImportError extends Error {}

export function salesSheet(rows: SalesSheet["rows"]): SalesSheet {
  const [header, ...records] = rows;
  if (!header || !records.length)
    throw new ImportError(
      "File perlu berisi judul kolom dan minimal satu baris data.",
    );
  if (records.length > maxRows)
    throw new ImportError("Gunakan maksimal 5.000 baris data per file.");
  if (
    header.cells.length < 2 ||
    rows.some(({ cells }) => cells.length > maxColumns)
  )
    throw new ImportError(
      "Siapkan 2 sampai 80 kolom dengan judul pada baris pertama.",
    );
  if (
    records.some(({ cells }) =>
      cells.slice(header.cells.length).some((value) => value.trim()),
    )
  )
    throw new ImportError(
      "Ada nilai di kolom tanpa judul. Lengkapi judul kolom terlebih dahulu.",
    );
  return {
    headers: Array.from(
      { length: header.cells.length },
      (_, index) =>
        header.cells[index]?.trim().slice(0, 120) || `Kolom ${index + 1}`,
    ),
    rows: records,
  };
}
