import {
  ImportError,
  type ImportFact,
  type ImportIssue,
  type ImportMapping,
  type SalesSheet,
} from "./import-types.ts";

const fields = [
  "date",
  "revenue",
  "order",
  "product",
  "status",
  "quantity",
] as const;
const aliases: Record<(typeof fields)[number], string[]> = {
  date: [
    "tanggal",
    "tanggal transaksi",
    "tanggal pesanan",
    "date",
    "order date",
    "waktu pesanan",
    "transaction date",
  ],
  revenue: [
    "nilai penjualan",
    "total penjualan",
    "total transaksi",
    "nominal",
    "penjualan",
    "revenue",
    "amount",
    "net sales",
    "subtotal",
    "total per item",
    "total item",
    "total pesanan",
    "order total",
    "harga satuan",
    "unit price",
  ],
  order: [
    "id pesanan",
    "nomor pesanan",
    "no pesanan",
    "order id",
    "order number",
    "receipt id",
  ],
  product: ["produk", "nama produk", "product", "product name", "item"],
  status: ["status", "status pesanan", "status transaksi", "order status"],
  quantity: ["kuantitas", "jumlah unit", "quantity", "qty"],
};

export function suggestMapping(headers: string[]): ImportMapping {
  const normalized = headers.map((header) =>
    header
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim(),
  );
  const lookup = (field: (typeof fields)[number]) => {
    const matches = normalized.flatMap((label, index) =>
      aliases[field].includes(label) ? [index] : [],
    );
    return matches.length === 1 ? matches[0] : -1;
  };
  return {
    date: lookup("date"),
    revenue: lookup("revenue"),
    order: lookup("order"),
    product: lookup("product"),
    status: lookup("status"),
    quantity: lookup("quantity"),
    basis: "line",
    dateFormat: "iso",
    moneyFormat: "id",
    validOnly: false,
    multiItem: false,
  };
}

export function verifyMapping(
  value: unknown,
  columnCount: number,
): ImportMapping {
  if (!value || typeof value !== "object")
    throw new ImportError("Pilih pemetaan kolom terlebih dahulu.");
  const mapping = value as ImportMapping;
  const mapped = fields.map((field) => mapping[field]);
  if (
    mapped.some(
      (index) => !Number.isInteger(index) || index < -1 || index >= columnCount,
    )
  )
    throw new ImportError("Salah satu kolom tidak tersedia di tab ini.");
  if (mapping.date < 0 || mapping.revenue < 0)
    throw new ImportError("Pilih kolom tanggal dan nilai penjualan.");
  if (
    new Set(mapped.filter((index) => index >= 0)).size !==
    mapped.filter((index) => index >= 0).length
  )
    throw new ImportError("Gunakan kolom berbeda untuk setiap isian.");
  if (
    !["line", "order", "unit"].includes(mapping.basis) ||
    !["dmy", "mdy", "iso"].includes(mapping.dateFormat) ||
    !["id", "en"].includes(mapping.moneyFormat) ||
    typeof mapping.validOnly !== "boolean" ||
    typeof mapping.multiItem !== "boolean"
  )
    throw new ImportError(
      "Periksa format tanggal, nilai, dan dasar perhitungan.",
    );
  if (mapping.basis === "order" && mapping.order < 0)
    throw new ImportError(
      "Total pesanan memerlukan ID pesanan untuk mencegah penghitungan ganda.",
    );
  if (mapping.basis === "unit" && mapping.quantity < 0)
    throw new ImportError("Harga satuan memerlukan kolom jumlah unit.");
  if (mapping.status < 0 && !mapping.validOnly)
    throw new ImportError(
      "Pilih kolom status atau konfirmasi bahwa file hanya memuat transaksi sah dan retur.",
    );
  if (
    mapping.statusValues !== undefined &&
    (!mapping.statusValues ||
      typeof mapping.statusValues !== "object" ||
      Array.isArray(mapping.statusValues) ||
      Object.keys(mapping.statusValues).length > 40 ||
      Object.entries(mapping.statusValues).some(
        ([key, value]) =>
          !key.trim() ||
          key.length > 80 ||
          /[\u0000-\u001f]/.test(key) ||
          !["completed", "pending", "cancelled", "refunded"].includes(value),
      ))
  )
    throw new ImportError("Makna status transaksi belum valid.");
  return {
    ...Object.fromEntries(
      [
        ...fields,
        "basis",
        "dateFormat",
        "moneyFormat",
        "validOnly",
        "multiItem",
      ].map((field) => [field, mapping[field as keyof ImportMapping]]),
    ),
    ...(mapping.statusValues
      ? { statusValues: { ...mapping.statusValues } }
      : {}),
  } as ImportMapping;
}

export function isoDate(value: string) {
  if (!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function dateParser(format: ImportMapping["dateFormat"], timezone: string) {
  const dateParts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  return (value: string) => {
    const match =
      /^(?<day>\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})(?:[ T](?<clock>\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(?<zone>Z|[+-]\d\d:?\d\d)?)?$/.exec(
        value,
      );
    if (!match?.groups)
      throw new ImportError("Tanggal tidak sesuai format yang dipilih.");
    const { day, clock, zone } = match.groups;
    let date = day;
    if (!/^\d{4}-/.test(day)) {
      if (format === "iso")
        throw new ImportError(
          "Pilih urutan hari dan bulan untuk tanggal pada file.",
        );
      const [first, second, year] = day.split(/[/.\-]/);
      const [dd, mm] = format === "dmy" ? [first, second] : [second, first];
      date = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    if (!isoDate(date)) throw new ImportError("Tanggal transaksi tidak valid.");
    if (!clock) return { date, occurred_at: null };
    const time = clock.replace(/^\d(?=:)/, "0$&");
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(time))
      throw new ImportError("Jam transaksi tidak valid.");
    const zoneName = offset
      .formatToParts(new Date(`${date}T${time}Z`))
      .find((part) => part.type === "timeZoneName")?.value;
    const timestamp = new Date(
      `${date}T${time}${zone || zoneName?.replace(/^GMT/, "") || "Z"}`,
    );
    if (!Number.isFinite(timestamp.valueOf()))
      throw new ImportError("Zona waktu transaksi tidak valid.");
    return {
      date: zone ? dateParts.format(timestamp) : date,
      occurred_at: timestamp.toISOString(),
    };
  };
}

export function rupiah(value: string, format: ImportMapping["moneyFormat"]) {
  const cleaned = value
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/^([+-]?)\s*(?:Rp\.?|IDR)\s*/i, "$1");
  const normalized = cleaned
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/^([+-])\s*/, "$1");
  const valid =
    format === "id"
      ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,0+)?$/
      : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/;
  if (!valid.test(normalized))
    throw new ImportError("Nilai penjualan tidak sesuai format Rupiah bulat.");
  const numeric = Number(
    format === "id"
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, ""),
  );
  if (!Number.isSafeInteger(numeric))
    throw new ImportError("Nilai penjualan melebihi batas perhitungan.");
  return numeric;
}

export function orderStatus(value: string) {
  const label = value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (["batal", "dibatalkan", "cancelled", "canceled", "void"].includes(label))
    return "cancelled";
  if (
    [
      "pending",
      "belum bayar",
      "belum dibayar",
      "diproses",
      "dikirim",
      "shipped",
      "processing",
      "unpaid",
    ].includes(label)
  )
    return "pending";
  if (
    [
      "retur",
      "refund",
      "refunded",
      "returned",
      "pengembalian",
      "dikembalikan",
    ].includes(label)
  )
    return "refunded";
  if (
    [
      "selesai",
      "lunas",
      "berhasil",
      "sah",
      "completed",
      "complete",
      "paid",
      "success",
    ].includes(label)
  )
    return "completed";
  throw new ImportError(
    "Status perlu berupa transaksi selesai, batal, diproses, atau retur.",
  );
}

export function normalizeSales(
  sheet: SalesSheet,
  mapping: ImportMapping,
  timezone: string,
) {
  const dateValue = dateParser(mapping.dateFormat, timezone);
  const issues: ImportIssue[] = [];
  const facts: ImportFact[] = [];
  const completedOrders = new Set<string>();
  const cancelled = new Set<string>();
  const duplicateRows = new Set<string>();
  const orderTotals = new Map<string, { revenue: number; date: string }>();
  let ordersAvailable = mapping.order >= 0;
  let skipped = 0;
  let sales = 0;
  let from = "";
  let through = "";

  for (const { number: row, cells } of sheet.rows) {
    try {
      const value = (index: number) => cells[index]?.trim() ?? "";
      const order = value(mapping.order);
      const product = value(mapping.product);
      const label = value(mapping.status);
      const initialStatus =
        mapping.status < 0
          ? "completed"
          : ((mapping.statusValues &&
            Object.hasOwn(mapping.statusValues, label.toLowerCase().trim())
              ? mapping.statusValues[label.toLowerCase().trim()]
              : undefined) ?? orderStatus(label));
      if (initialStatus === "cancelled" || initialStatus === "pending") {
        if (order && initialStatus === "cancelled") cancelled.add(order);
        skipped++;
        continue;
      }
      const { date, occurred_at } = dateValue(value(mapping.date));
      const money = rupiah(value(mapping.revenue), mapping.moneyFormat);
      const quantityText = value(mapping.quantity);
      const quantity = quantityText ? Number(quantityText) : null;
      if (
        quantity !== null &&
        (!/^\d+$/.test(quantityText) ||
          quantity < 1 ||
          quantity > 2_147_483_647)
      )
        throw new ImportError(
          "Jumlah unit harus berupa bilangan bulat positif.",
        );
      if (mapping.basis === "unit" && !quantity)
        throw new ImportError(
          "Isi jumlah unit untuk menghitung nilai dari harga satuan.",
        );
      if (mapping.basis === "order" && !order)
        throw new ImportError(
          "ID pesanan diperlukan pada setiap baris yang dihitung.",
        );
      if (
        order.length > 150 ||
        product.length > 250 ||
        /[\u0000-\u001f]/.test(order + product)
      )
        throw new ImportError(
          "ID pesanan atau nama produk terlalu panjang atau mengandung karakter kontrol.",
        );
      if (order) {
        const key = JSON.stringify(cells);
        if (duplicateRows.has(key))
          throw new ImportError(
            "Baris yang sama muncul lagi. Periksa duplikat sebelum memakai file.",
          );
        duplicateRows.add(key);
      }
      const status =
        initialStatus === "refunded" || money < 0 ? "refunded" : "completed";
      const amount = mapping.basis === "unit" ? money * (quantity ?? 1) : money;
      let revenue = status === "refunded" ? -Math.abs(amount) : amount;
      if (!Number.isSafeInteger(revenue))
        throw new ImportError("Nilai hasil perhitungan melebihi batas Rupiah.");

      if (mapping.basis === "order") {
        const key = JSON.stringify([order, status]);
        const previous = orderTotals.get(key);
        if (
          previous &&
          (previous.revenue !== revenue || previous.date !== date)
        )
          throw new ImportError(
            "Total atau tanggal berbeda untuk ID pesanan yang sama. Periksa dasar nilai pada file.",
          );
        if (previous) revenue = 0;
        else orderTotals.set(key, { revenue, date });
      } else if (
        order &&
        status === "completed" &&
        completedOrders.has(order) &&
        !mapping.multiItem
      ) {
        throw new ImportError(
          "ID pesanan berulang. Konfirmasi baris per item atau pilih total pesanan.",
        );
      }

      if (!Number.isSafeInteger(sales + revenue))
        throw new ImportError("Total penjualan melebihi batas perhitungan.");
      sales += revenue;
      if (status === "completed") {
        if (order) completedOrders.add(order);
        else ordersAvailable = false;
      }
      if (!from || date < from) from = date;
      if (!through || date > through) through = date;
      facts.push({
        row,
        date,
        occurred_at,
        order_id: order || null,
        product: product || null,
        quantity,
        status,
        revenue,
        product_revenue: product && mapping.basis !== "order" ? revenue : null,
      });
    } catch (error) {
      if (!(error instanceof ImportError)) throw error;
      issues.push({ row, message: error.message });
    }
  }

  for (const fact of facts) {
    if (
      fact.status === "completed" &&
      fact.order_id &&
      cancelled.has(fact.order_id)
    )
      issues.push({
        row: fact.row,
        message:
          "ID ini juga tercatat batal. Sisakan status akhir sebelum mengimpor.",
      });
  }
  return {
    facts,
    issues,
    skipped,
    sales,
    from,
    through,
    orders: ordersAvailable ? completedOrders.size : null,
    products:
      facts.length > 0 && facts.every((item) => item.product_revenue !== null),
  };
}
