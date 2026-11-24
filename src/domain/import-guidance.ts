import { normalizeSales, rupiah, suggestMapping } from "./import-sales.ts";
import type { ImportMapping, SalesSheet } from "./import-types.ts";

export type ImportGuidance = {
  basisConfirmed: boolean;
  dateConfirmed: boolean;
  moneyConfirmed: boolean;
  canPreview: boolean;
  message: string;
};

/** Suggest only interpretations supported by headers and the full source.
 * Identical repeated amounts remain ambiguous: equal-priced items and repeated
 * order totals must not be silently treated as the same business event. */
export function analyzeImport(sheet: SalesSheet, timezone: string) {
  const mapping = suggestMapping(sheet.headers);
  const name = (sheet.headers[mapping.revenue] ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const orderHeader = /^(total pesanan|order total)$/.test(name);
  const unitHeader = /^(harga satuan|unit price)$/.test(name);
  const explicitLine = /^(subtotal|total per item|total item)$/.test(name);
  const lineHeader = explicitLine || /^(nilai penjualan|net sales)$/.test(name);
  mapping.basis = orderHeader ? "order" : unitHeader ? "unit" : "line";

  let datesIso = true;
  let dmy = false;
  let mdy = false;
  let formattedDates = false;
  let idPossible = true;
  let enPossible = true;
  let differentMoney = false;
  const orders = new Map<string, Set<string>>();
  let repeated = false;
  let differentAmounts = false;
  for (const { cells } of sheet.rows) {
    const date = cells[mapping.date]?.trim() ?? "";
    if (date && !/^\d{4}-\d{2}-\d{2}(?:[ T]|$)/.test(date)) {
      datesIso = false;
      const parts = /^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{4}(?:[ T]|$)/.exec(date);
      if (parts) {
        formattedDates = true;
        if (Number(parts[1]) > 12) dmy = true;
        if (Number(parts[2]) > 12) mdy = true;
      }
    }
    const money = cells[mapping.revenue]?.trim() ?? "";
    let id: number | undefined;
    let en: number | undefined;
    if (money) {
      try {
        id = rupiah(money, "id");
      } catch {
        idPossible = false;
      }
      try {
        en = rupiah(money, "en");
      } catch {
        enPossible = false;
      }
      if (id !== undefined && en !== undefined && id !== en)
        differentMoney = true;
    }
    const order = cells[mapping.order]?.trim();
    // Refunds have their own dates/amounts and cannot establish an order-total basis.
    const status = (cells[mapping.status] ?? "").trim().toLowerCase();
    if (
      order &&
      /^(selesai|lunas|berhasil|sah|completed?|paid|success)$/.test(status)
    ) {
      const amounts = orders.get(order);
      if (amounts) {
        repeated = true;
        const key = String(id ?? en ?? money);
        if (!amounts.has(key)) differentAmounts = true;
        amounts.add(key);
      } else orders.set(order, new Set([String(id ?? en ?? money)]));
    }
  }
  if (!datesIso && dmy && !mdy) mapping.dateFormat = "dmy";
  if (!datesIso && mdy && !dmy) mapping.dateFormat = "mdy";
  if (enPossible && !idPossible) mapping.moneyFormat = "en";
  const basisConfirmed =
    orderHeader ||
    (unitHeader && mapping.quantity >= 0) ||
    (lineHeader && (!repeated || differentAmounts || explicitLine));
  // An explicit per-item basis permits repeated order IDs while exact duplicate
  // rows, conflicting statuses and invalid quantities remain validation errors.
  mapping.multiItem = basisConfirmed && mapping.basis !== "order";
  const dateConfirmed =
    mapping.date >= 0 && (datesIso || (formattedDates && dmy !== mdy));
  const moneyConfirmed =
    mapping.revenue >= 0 &&
    (idPossible || enPossible) &&
    (!(idPossible && enPossible) || !differentMoney);
  const knownColumns =
    mapping.date >= 0 && mapping.revenue >= 0 && mapping.status >= 0;
  const canPreview =
    knownColumns &&
    basisConfirmed &&
    dateConfirmed &&
    moneyConfirmed &&
    normalizeSales(sheet, mapping, timezone).issues.length === 0;
  return {
    mapping,
    guidance: {
      basisConfirmed,
      dateConfirmed,
      moneyConfirmed,
      canPreview,
      message: canPreview
        ? "Kolom dan cara membaca nilai dikenali otomatis. Periksa ringkasan sebelum menggunakan data."
        : !basisConfirmed
          ? "Kolom yang dikenali sudah terisi. Pastikan arti nilai penjualan agar pesanan tidak dihitung ganda."
          : !dateConfirmed || !moneyConfirmed
            ? "Kolom yang dikenali sudah terisi. Pilih format tanggal atau angka yang belum jelas."
            : "Kolom yang dikenali sudah terisi. Lengkapi bagian yang belum sesuai sebelum melihat pratinjau.",
    } satisfies ImportGuidance,
  };
}

/** A correction is offered only if it removes every validation error.
 * Applying it still requires a fresh server preview and explicit activation. */
export function suggestImportCorrection(
  sheet: SalesSheet,
  mapping: ImportMapping,
  timezone: string,
) {
  if (mapping.basis !== "order") return undefined;
  if (
    /^(total pesanan|order total)$/.test(
      (sheet.headers[mapping.revenue] ?? "")
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .trim(),
    )
  )
    return undefined;
  const current = normalizeSales(sheet, mapping, timezone);
  if (
    !current.issues.length ||
    !current.issues.every(
      (issue) =>
        issue.message ===
        "Total atau tanggal berbeda untuk ID pesanan yang sama. Periksa dasar nilai pada file.",
    )
  )
    return undefined;
  const next: ImportMapping = { ...mapping, basis: "line", multiItem: true };
  const corrected = normalizeSales(sheet, next, timezone);
  if (corrected.issues.length || !corrected.facts.length) return undefined;
  const amounts = new Map<string, Set<number>>();
  for (const fact of corrected.facts) {
    if (fact.status !== "completed" || !fact.order_id) continue;
    const key = fact.order_id + "|" + fact.date;
    const values = amounts.get(key) ?? new Set<number>();
    values.add(fact.revenue);
    amounts.set(key, values);
  }
  if (![...amounts.values()].some((values) => values.size > 1))
    return undefined;
  return {
    mapping: next,
    message:
      "Nilai pada item dalam pesanan ini berbeda. Periksa pratinjau dengan nilai per item; jumlah pesanan tetap dihitung satu kali.",
    label: "Gunakan nilai per item",
  };
}
