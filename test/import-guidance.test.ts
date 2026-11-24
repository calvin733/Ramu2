import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeImport,
  suggestImportCorrection,
} from "../src/domain/import-guidance.ts";
import { normalizeSales } from "../src/domain/import-sales.ts";
import { readCsv } from "../src/server/import/csv.ts";

const table = (text: string) => readCsv(Buffer.from(text));
const source = () =>
  table(
    "Tanggal,ID Pesanan,Produk,Status,Kuantitas,Nilai Penjualan,ID Baris Sumber\n2026-11-01,0001,Kemeja,Selesai,2,300000,L1\n2026-11-01,0001,Celana,Selesai,1,200000,L2\n2026-11-04,0001,Kemeja,Retur,1,-150000,R1\n2026-11-04,0002,Rok,Batal,1,90000,L3",
  );

test("recognized item sales go straight to preview without manually matching columns", () => {
  const sheet = source();
  const { mapping, guidance } = analyzeImport(sheet, "Asia/Jakarta");
  assert.equal(guidance.canPreview, true);
  assert.equal(mapping.basis, "line");
  assert.equal(mapping.multiItem, true);
  const result = normalizeSales(sheet, mapping, "Asia/Jakarta");
  assert.equal(result.sales, 350000);
  assert.equal(result.orders, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.issues, []);
});

test("repeated equal amounts require a basis decision while explicit order totals stay deduplicated", () => {
  const ambiguous = table(
    "Tanggal,ID Pesanan,Produk,Status,Nilai Penjualan\n2026-11-01,1,Kaos,Selesai,100000\n2026-11-01,1,Rok,Selesai,100000",
  );
  assert.equal(
    analyzeImport(ambiguous, "Asia/Jakarta").guidance.basisConfirmed,
    false,
  );
  assert.equal(
    analyzeImport(ambiguous, "Asia/Jakarta").guidance.canPreview,
    false,
  );
  const explicit = table(
    "Waktu Pesanan,No. Pesanan,Nama Produk,Status Pesanan,Total Pesanan\n2026-11-01,1,Kaos,Selesai,100000\n2026-11-01,1,Rok,Selesai,100000",
  );
  const { mapping, guidance } = analyzeImport(explicit, "Asia/Jakarta");
  assert.equal(guidance.canPreview, true);
  assert.equal(mapping.basis, "order");
  assert.equal(normalizeSales(explicit, mapping, "Asia/Jakarta").sales, 100000);
  ambiguous.rows[1].cells[4] = "Rp100.000";
  assert.equal(
    analyzeImport(ambiguous, "Asia/Jakarta").guidance.canPreview,
    false,
  );
});

test("ambiguous dates and decimal/thousands separators require a choice instead of silently changing totals", () => {
  const ambiguous = table(
    "Tanggal,Status,Nilai Penjualan\n03/04/2026,Selesai,1.000\n04/05/2026,Selesai,2.000",
  );
  const { guidance } = analyzeImport(ambiguous, "Asia/Jakarta");
  assert.equal(guidance.dateConfirmed, false);
  assert.equal(guidance.moneyConfirmed, false);
  assert.equal(guidance.canPreview, false);
  const clear = table(
    "Tanggal,Status,Nilai Penjualan\n17/11/2026,Selesai,12000\n18/11/2026,Selesai,25000",
  );
  const analysis = analyzeImport(clear, "Asia/Jakarta");
  assert.equal(analysis.mapping.dateFormat, "dmy");
  assert.equal(analysis.guidance.canPreview, true);
});

test("an order/item correction requires a fully valid replacement and does not rewrite source data", () => {
  const sheet = source();
  const original = JSON.stringify(sheet);
  const mapping = {
    ...analyzeImport(sheet, "Asia/Jakarta").mapping,
    basis: "order" as const,
  };
  assert.equal(normalizeSales(sheet, mapping, "Asia/Jakarta").issues.length, 1);
  const correction = suggestImportCorrection(sheet, mapping, "Asia/Jakarta");
  assert.ok(correction);
  assert.equal(correction.mapping.basis, "line");
  assert.equal(
    normalizeSales(sheet, correction.mapping, "Asia/Jakarta").sales,
    350000,
  );
  assert.equal(JSON.stringify(sheet), original);
  sheet.rows.push({ ...sheet.rows[0], number: 9 });
  assert.equal(
    suggestImportCorrection(sheet, mapping, "Asia/Jakarta"),
    undefined,
  );
  sheet.rows.pop();
  sheet.headers[5] = "Total Pesanan";
  assert.equal(
    suggestImportCorrection(sheet, mapping, "Asia/Jakarta"),
    undefined,
  );
});

test("missing status, conflicting headers and real duplicates are not automatically accepted", () => {
  const duplicate = source();
  duplicate.rows.push({ ...duplicate.rows[0], number: 10 });
  assert.equal(
    analyzeImport(duplicate, "Asia/Jakarta").guidance.canPreview,
    false,
  );
  const missing = table("Tanggal,Nilai Penjualan\n2026-11-01,100000");
  assert.equal(
    analyzeImport(missing, "Asia/Jakarta").guidance.canPreview,
    false,
  );
  const conflict = table(
    "Tanggal,Nilai Penjualan,Nominal,Status\n2026-11-01,100000,50000,Selesai",
  );
  assert.equal(analyzeImport(conflict, "Asia/Jakarta").mapping.revenue, -1);
  assert.equal(
    analyzeImport(conflict, "Asia/Jakarta").guidance.canPreview,
    false,
  );
});
