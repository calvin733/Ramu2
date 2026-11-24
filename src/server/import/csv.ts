import {
  ImportError,
  maxColumns,
  maxRows,
  salesSheet,
  type SalesSheet,
} from "../../domain/import-types.ts";

function parse(text: string, delimiter: string) {
  const rows: SalesSheet["rows"] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let row = 1;

  function finishCell() {
    cells.push(cell);
    if (cells.length > maxColumns)
      throw new ImportError("Gunakan maksimal 80 kolom per file.");
    cell = "";
    closed = false;
  }

  function finishRow() {
    finishCell();
    if (cells.some((value) => value.trim())) rows.push({ number: row, cells });
    if (rows.length > maxRows + 1)
      throw new ImportError("Gunakan maksimal 5.000 baris data per file.");
    cells = [];
    row = line;
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += character;
        if (
          character === "\n" ||
          (character === "\r" && text[index + 1] !== "\n")
        )
          line++;
      }
    } else if (character === delimiter) {
      finishCell();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      line++;
      finishRow();
    } else if (character === '"' && !cell && !closed) {
      quoted = true;
    } else {
      if (closed || character === '"')
        throw new ImportError(`Tanda kutip CSV bermasalah di baris ${line}.`);
      cell += character;
    }
  }
  if (quoted)
    throw new ImportError(`Tanda kutip CSV belum ditutup di baris ${row}.`);
  if (cell || cells.length || closed) finishRow();
  return rows;
}

export function readCsv(buffer: Uint8Array) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ImportError("Simpan ulang CSV dengan pengodean UTF-8.");
  }
  if (text.includes("\0"))
    throw new ImportError("Isi file tidak terbaca sebagai CSV UTF-8.");

  const declared = /^sep=([,;\t])\r?\n/i.exec(text);
  if (declared) text = text.slice(declared[0].length);
  const candidates = [];
  let lastError;
  for (const delimiter of declared ? [declared[1]] : [",", ";", "\t"]) {
    try {
      const rows = parse(text, delimiter);
      const width = rows[0]?.cells.length ?? 0;
      if (width > 1)
        candidates.push({
          rows,
          width,
          matching:
            rows.filter(({ cells }) => cells.length === width).length /
            rows.length,
        });
    } catch (error) {
      lastError ??= error;
    }
  }
  candidates.sort((a, b) => b.matching - a.matching || b.width - a.width);
  const selected = candidates[0];
  if (!selected)
    throw (
      lastError ??
      new ImportError("Gunakan pemisah kolom koma, titik koma, atau tab.")
    );
  if (selected.matching !== 1)
    throw new ImportError(
      "Jumlah kolom CSV berbeda antarbaris. Periksa pemisah dan tanda kutip pada file.",
    );
  if (declared) for (const record of selected.rows) record.number++;
  return salesSheet(selected.rows);
}
