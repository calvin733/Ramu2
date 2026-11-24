import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import {
  normalizeSales,
  suggestMapping,
  verifyMapping,
} from "../src/domain/import-sales.ts";
import { readCsv } from "../src/server/import/csv.ts";
import { openXlsx } from "../src/server/import/xlsx.ts";

const csv = (text: string) => readCsv(Buffer.from(text));

test("CSV mempertahankan nol di depan, ID multiitem, pembatalan, dan satu pengurangan retur", () => {
  const table = csv(
    `\uFEFFTanggal;Nilai Penjualan;ID pesanan;Produk;Status\r\n17/11/2026;Rp50.000;00042;"Roti; keju";selesai\r\n17/11/2026;Rp25.000;00042;Brownies;selesai\r\n18/11/2026;-10.000;00042;Brownies;retur\r\n19/11/2026;999.000;00043;Roti;batal`,
  );
  const mapping = verifyMapping(
    { ...suggestMapping(table.headers), dateFormat: "dmy", multiItem: true },
    table.headers.length,
  );
  const result = normalizeSales(table, mapping, "Asia/Jakarta");
  assert.deepEqual(result.issues, []);
  assert.equal(result.orders, 1);
  assert.equal(result.sales, 65_000);
  assert.equal(result.products, true);
  assert.equal(result.skipped, 1);
  assert.equal(result.facts[0].order_id, "00042");
  assert.equal(result.facts[0].product, "Roti; keju");
  assert.equal(result.facts[2].revenue, -10_000);
});

test("total pesanan berulang dihitung sekali tanpa mengalokasikannya ke produk", () => {
  const table = csv(
    "Tanggal,Nilai Penjualan,ID Pesanan,Produk\n2026-11-17,70000,0001,Roti\n2026-11-17,70000,0001,Brownies\n2026-11-18,15000,0002,Donat",
  );
  const mapping = verifyMapping(
    { ...suggestMapping(table.headers), basis: "order", validOnly: true },
    table.headers.length,
  );
  const result = normalizeSales(table, mapping, "Asia/Jakarta");
  assert.deepEqual(result.issues, []);
  assert.equal(result.sales, 85_000);
  assert.equal(result.orders, 2);
  assert.equal(result.products, false);
  assert.deepEqual(
    result.facts.map((fact) => fact.revenue),
    [70_000, 0, 15_000],
  );
});

test("contoh sintetis laporan pesanan dan kasir bisa dipetakan secara manual", () => {
  const shopee = csv(
    "Waktu Pesanan,Total Pesanan,No. Pesanan,Nama Produk,Status Pesanan\n2026-11-17,80000,ORD-01,Cokelat,Selesai\n2026-11-17,80000,ORD-01,Roti,Selesai\n2026-11-18,25000,ORD-02,Roti,Belum Bayar",
  );
  const marketplace = normalizeSales(
    shopee,
    verifyMapping(
      {
        ...suggestMapping(shopee.headers),
        date: 0,
        revenue: 1,
        order: 2,
        basis: "order",
      },
      shopee.headers.length,
    ),
    "Asia/Jakarta",
  );
  assert.deepEqual(marketplace.issues, []);
  assert.equal(marketplace.sales, 80_000);
  assert.equal(marketplace.orders, 1);
  assert.equal(marketplace.products, false);

  const moka = csv(
    "Transaction Date,Net Sales,Receipt ID,Item,Status\n2026-11-17,55000,0007,Sablé,Selesai\n2026-11-18,15000,0007,Sablé,Refund",
  );
  const cashier = normalizeSales(
    moka,
    verifyMapping(
      {
        ...suggestMapping(moka.headers),
        date: 0,
        revenue: 1,
        order: 2,
        product: 3,
      },
      moka.headers.length,
    ),
    "Asia/Jakarta",
  );
  assert.deepEqual(cashier.issues, []);
  assert.equal(cashier.sales, 40_000);
  assert.equal(cashier.orders, 1);
  assert.equal(cashier.products, true);
});

test("file tanpa ID memberi penjualan yang sah dan metrik pesanan kosong", () => {
  const table = csv(
    "Tanggal,Nilai Penjualan,Jumlah unit\n2026-11-17T18:00:00Z,50000,3",
  );
  const suggested = suggestMapping(table.headers);
  assert.throws(
    () => verifyMapping(suggested, table.headers.length),
    /kolom status/,
  );
  const mapping = verifyMapping(
    { ...suggested, basis: "unit", validOnly: true },
    table.headers.length,
  );
  const result = normalizeSales(table, mapping, "Asia/Jakarta");
  assert.equal(result.orders, null);
  assert.equal(result.sales, 150_000);
  assert.equal(result.facts[0].date, "2026-11-18");
  assert.equal(result.facts[0].occurred_at, "2026-11-17T18:00:00.000Z");
});

test("kolom wajib, tanggal ambigu, duplikat, dan total order tidak konsisten memblokir aktivasi", () => {
  const table = csv(
    "Tanggal;Nilai Penjualan;ID Pesanan\n03/04/2026;70000;0001\n03/04/2026;70000;0001\n03/04/2026;80000;0001\n31/02/2026;;0002",
  );
  const mapping = {
    ...suggestMapping(table.headers),
    basis: "order" as const,
    validOnly: true,
  };
  assert.throws(
    () => verifyMapping({ ...mapping, revenue: -1 }, table.headers.length),
    /tanggal dan nilai/,
  );
  assert.match(
    normalizeSales(table, mapping, "Asia/Jakarta").issues[0].message,
    /urutan hari dan bulan/,
  );
  const result = normalizeSales(
    table,
    { ...mapping, dateFormat: "dmy" },
    "Asia/Jakarta",
  );
  assert.deepEqual(
    result.issues.map(({ row }) => row),
    [3, 4, 5],
  );
  assert.match(result.issues[0].message, /duplikat/);
  assert.match(result.issues[1].message, /Total atau tanggal berbeda/);
  assert.throws(() => csv('Tanggal,Nilai\n2026-11-17,"50000'), /tanda kutip/i);
});

function zip(entries: Record<string, string>) {
  const local = [];
  const directory = [];
  let offset = 0;
  for (const [filename, xml] of Object.entries(entries)) {
    const name = Buffer.from(filename);
    const bytes = Buffer.from(xml);
    const packed = deflateRawSync(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    header.copy(central, 8, 6, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += header.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...directory, end]);
}

test("XLSX membaca daftar tab, tanggal Excel, string bersama, dan format ID berawalan nol", () => {
  const workbook = zip({
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Catatan" r:id="rId1"/><sheet name="Penjualan &amp; retur" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Type="a/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="a/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="a/styles" Target="styles.xml"/><Relationship Id="rId4" Type="a/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": "<worksheet><sheetData/></worksheet>",
    "xl/worksheets/sheet2.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Nilai Penjualan</t></is></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" s="1"><v>46343</v></c><c r="B3"><v>50000</v></c><c r="C3" s="2"><v>42</v></c></row></sheetData></worksheet>',
    "xl/styles.xml":
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Tanggal</t></si><si><r><t>ID </t></r><r><t>Pesanan</t></r></si></sst>",
  });
  const file = openXlsx(workbook);
  assert.deepEqual(file.names, ["Catatan", "Penjualan & retur"]);
  const table = file.read(1);
  assert.deepEqual(table.headers, ["Tanggal", "Nilai Penjualan", "ID Pesanan"]);
  assert.deepEqual(table.rows[0], {
    number: 3,
    cells: ["2026-11-17", "50000", "00042"],
  });
  assert.throws(() => openXlsx(workbook.subarray(0, -3)), /XLSX rusak/);
});
