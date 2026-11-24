import { posix as path } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import {
  ImportError,
  maxColumns,
  maxRows,
  salesSheet,
  type SalesSheet,
} from "../../domain/import-types.ts";

const zipLimit = 24 * 1024 * 1024;

function badWorkbook(): never {
  throw new ImportError(
    "File XLSX rusak, terkunci, atau memakai format yang tidak didukung. Simpan ulang sebagai .xlsx atau CSV UTF-8.",
  );
}

function archive(buffer: Buffer) {
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65_557)) {
    if (
      buffer.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + buffer.readUInt16LE(end + 20) === buffer.length
    )
      break;
    end--;
  }
  if (end < Math.max(0, buffer.length - 65_557)) badWorkbook();
  const count = buffer.readUInt16LE(end + 10);
  if (
    count > 500 ||
    buffer.readUInt32LE(end + 4) !== 0 ||
    count !== buffer.readUInt16LE(end + 8)
  )
    badWorkbook();
  const entries = new Map<
    string,
    { start: number; packed: number; size: number; method: number; crc: number }
  >();
  let cursor = buffer.readUInt32LE(end + 16);
  if (cursor + buffer.readUInt32LE(end + 12) !== end) badWorkbook();
  let expanded = 0;

  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      badWorkbook();
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const packed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const next =
      cursor +
      46 +
      nameLength +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    if (
      next > end ||
      offset + 30 > end ||
      buffer.readUInt32LE(offset) !== 0x04034b50 ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      badWorkbook();
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const start =
      offset +
      30 +
      buffer.readUInt16LE(offset + 26) +
      buffer.readUInt16LE(offset + 28);
    expanded += size;
    if (entries.has(name) || start + packed > end || expanded > zipLimit)
      badWorkbook();
    entries.set(name, { start, packed, size, method, crc });
    cursor = next;
  }

  return (name: string) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const compressed = buffer.subarray(entry.start, entry.start + entry.packed);
    const data =
      entry.method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: Math.max(1, entry.size),
          });
    if (data.length !== entry.size || crc32(data) !== entry.crc) badWorkbook();
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) badWorkbook();
    return xml.replace(/<!--[^]*?-->/g, "");
  };
}

function decode(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(
    /&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (_, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity];
      const point = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      if (
        point > 0x10ffff ||
        point === 0 ||
        (point >= 0xd800 && point <= 0xdfff)
      )
        badWorkbook();
      return String.fromCodePoint(point);
    },
  );
}

function tags(xml: string, name: string) {
  const tag = `(?:[\\w.-]+:)?${name}`;
  const open = new RegExp(
    `<${tag}(?=[\\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>`,
    "g",
  );
  const close = new RegExp(`</${tag}\\s*>`, "g");

  return (function* () {
    for (let match = open.exec(xml); match; match = open.exec(xml)) {
      const raw = match[1];
      if (raw.endsWith("/")) {
        yield [match[0], raw.slice(0, -1), undefined] as const;
        continue;
      }
      close.lastIndex = open.lastIndex;
      const end = close.exec(xml);
      if (!end) badWorkbook();
      const body = xml.slice(open.lastIndex, end.index);
      open.lastIndex = close.lastIndex;
      yield [match[0], raw, body] as const;
    }
  })();
}

function attrs(raw: string) {
  return Object.fromEntries(
    Array.from(
      raw.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g),
      (match) => [match[1], decode(match[2] ?? match[3])],
    ),
  );
}

function first(xml: string, name: string) {
  return tags(xml, name).next().value;
}

function richText(xml: string) {
  return Array.from(
    tags(xml.replace(/<(?:[\w.-]+:)?rPh\b[^]*?<\/(?:[\w.-]+:)?rPh>/g, ""), "t"),
    (match) => decode(match[2] ?? ""),
  ).join("");
}

function workbookDate(serial: number, year1904: boolean) {
  if (
    !Number.isFinite(serial) ||
    serial < 0 ||
    serial >= 2_958_466 ||
    (!year1904 && Math.floor(serial) === 60)
  )
    badWorkbook();
  const origin = year1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, serial < 60 ? 31 : 30);
  const value = new Date(
    origin + Math.round(serial * 86_400_000),
  ).toISOString();
  return Number.isInteger(serial) ? value.slice(0, 10) : value.slice(0, -1);
}

export function openXlsx(buffer: Buffer) {
  try {
    const read = archive(buffer);
    const workbook = read("xl/workbook.xml");
    const relations = read("xl/_rels/workbook.xml.rels");
    if (!workbook || !relations) badWorkbook();
    const entries = Array.from(tags(relations, "Relationship"), ([, raw]) =>
      attrs(raw),
    );
    const byId = new Map(entries.map((entry) => [entry.Id, entry]));
    const resolve = (target: string) =>
      target.startsWith("/") ? target.slice(1) : path.join("xl", target);
    const relatedXml = (type: string) => {
      const entry = entries.find(
        (item) =>
          item.Type?.endsWith(`/${type}`) && item.TargetMode !== "External",
      );
      return entry?.Target ? (read(resolve(entry.Target)) ?? "") : "";
    };
    const sheets: { name: string; file: string }[] = [];
    for (const [, raw] of tags(workbook, "sheet")) {
      const { name, state, ...properties } = attrs(raw);
      const id = Object.entries(properties).find(([key]) =>
        key.endsWith(":id"),
      )?.[1];
      const entry = id ? byId.get(id) : undefined;
      if (
        name &&
        entry?.Target &&
        entry.TargetMode !== "External" &&
        entry.Type?.endsWith("/worksheet") &&
        (!state || state === "visible")
      ) {
        sheets.push({ name, file: resolve(entry.Target) });
      }
    }
    if (!sheets.length || sheets.length > 50) badWorkbook();
    const year1904 = /^(?:1|true)$/.test(
      attrs(first(workbook, "workbookPr")?.[1] ?? "").date1904 ?? "",
    );

    return {
      names: sheets.map(({ name }) => name),
      read(index: number) {
        try {
          const sheet = sheets[index];
          const xml = sheet && read(sheet.file);
          if (!xml) badWorkbook();
          const shared = Array.from(
            tags(relatedXml("sharedStrings"), "si"),
            ([, , body]) => richText(body ?? ""),
          );
          const styles = relatedXml("styles");
          const codes = new Map(
            Array.from(tags(styles, "numFmt"), ([, raw]) => {
              const { numFmtId, formatCode } = attrs(raw);
              return [Number(numFmtId), formatCode ?? ""];
            }),
          );
          const formats = Array.from(
            tags(first(styles, "cellXfs")?.[2] ?? "", "xf"),
            ([, raw]) => Number(attrs(raw).numFmtId),
          );
          const rows: SalesSheet["rows"] = [];
          let number = 0;
          for (const [, raw, body] of tags(xml, "row")) {
            number = Number(attrs(raw).r || number + 1);
            if (!Number.isInteger(number) || number < 1 || number > 1_048_576)
              badWorkbook();
            const cells: string[] = [];
            let column = -1;
            for (const [, cellRaw, cellBody] of tags(body ?? "", "c")) {
              const { r, t, s } = attrs(cellRaw);
              const letters = /^[A-Z]{1,3}(?=\d+$)/.exec(r ?? "")?.[0];
              column = letters
                ? Array.from(letters).reduce(
                    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
                    0,
                  ) - 1
                : column + 1;
              const cell = cellBody ?? "";
              const rawValue = first(cell, "v")?.[2];
              if (!rawValue && t !== "inlineStr" && !first(cell, "f")) continue;
              if (column >= maxColumns)
                throw new ImportError("Gunakan maksimal 80 kolom per tab.");
              const value = decode(rawValue ?? "");
              const format = formats[Number(s ?? 0)];
              const code = codes.get(format) ?? "";
              const dateCode = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
              if (t === "inlineStr") cells[column] = richText(cell);
              else if (t === "s")
                cells[column] = shared[Number(value)] ?? badWorkbook();
              else if (
                (!t || t === "n") &&
                value &&
                ((format >= 14 && format <= 17) ||
                  format === 22 ||
                  /[dy]/i.test(dateCode))
              )
                cells[column] = workbookDate(Number(value), year1904);
              else if (
                (!t || t === "n") &&
                /^0{2,}$/.test(code) &&
                /^\d+$/.test(value)
              )
                cells[column] = value.padStart(Math.min(code.length, 150), "0");
              else if (!t || t === "n")
                cells[column] =
                  value && Number.isFinite(Number(value))
                    ? String(Number(value))
                    : value;
              else cells[column] = value;
            }
            if (cells.some((value) => value.trim()))
              rows.push({ number, cells });
            if (rows.length > maxRows + 1)
              throw new ImportError(
                "Gunakan maksimal 5.000 baris data per tab.",
              );
          }
          return salesSheet(rows);
        } catch (error) {
          if (error instanceof ImportError) throw error;
          return badWorkbook();
        }
      },
    };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    return badWorkbook();
  }
}
