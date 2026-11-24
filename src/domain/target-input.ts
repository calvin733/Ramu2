import { isoDate } from "./import-sales.ts";
import {
  daysBetween,
  isTargetKind,
  targetKinds,
  type ManagedTarget,
} from "./targets.ts";

type Field = "kind" | "value" | "start" | "end" | "sellingDays";
export type TargetActionState = {
  error?: string;
  field?: Field;
  saved?: "disimpan" | "dihapus";
};

export function targetDate(input: string) {
  if (isoDate(input)) return input;
  const parts = /^(\d\d)\/?(\d\d)\/?(\d{4})$/.exec(input);
  if (!parts || (input.includes("/") && input.length !== 10)) return null;
  const normalized = parts[3] + "-" + parts[2] + "-" + parts[1];
  return isoDate(normalized) ? normalized : null;
}

export function targetInput(
  form: FormData,
): TargetActionState | { target: Omit<ManagedTarget, "id" | "version"> } {
  const read = (field: Field) => String(form.get(field) ?? "").trim();
  const kind = read("kind");
  if (!isTargetKind(kind))
    return { field: "kind", error: "Pilih jenis target." };
  const start = targetDate(read("start"));
  const end = targetDate(read("end"));
  if (!start)
    return {
      field: "start",
      error: "Masukkan tanggal mulai yang valid dalam format DD/MM/YYYY.",
    };
  if (!end || end < start)
    return {
      field: "end",
      error:
        "Masukkan tanggal selesai yang valid dan sama dengan atau setelah tanggal mulai.",
    };
  const amount = read("value");
  const value = Number(amount.replaceAll(".", ""));
  if (
    !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(amount) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  )
    return {
      field: "value",
      error: "Masukkan nilai target berupa bilangan bulat positif.",
    };

  const selling = read("sellingDays");
  const sellingDays = selling ? Number(selling) : null;
  if (
    sellingDays !== null &&
    (!/^\d+$/.test(selling) ||
      !Number.isInteger(sellingDays) ||
      sellingDays > daysBetween(start, end) + 1)
  )
    return {
      field: "sellingDays",
      error:
        "Masukkan 0 atau jumlah hari jual yang tidak melebihi panjang periode target.",
    };

  return {
    target: {
      kind,
      label: targetKinds[kind],
      value,
      range: { start, end },
      sellingDays,
      primary: form.get("primary") === "on",
    },
  };
}
