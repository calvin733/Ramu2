"use client";

const vendors = {
  Shopee: {
    steps: [
      "Buka Seller Centre dan masuk ke Pesanan Saya.",
      "Pilih rentang tanggal pesanan yang ingin dianalisis, lalu ekspor laporan pesanan.",
      "Pilih file Excel atau CSV yang memuat tanggal, nilai, dan ID pesanan. Petakan status agar transaksi batal dan belum selesai dapat dipisahkan.",
    ],
    url: "https://seller.shopee.co.id/",
    link: "Buka Shopee Seller Centre",
  },
  Moka: {
    steps: [
      "Di Moka Backoffice, buka Reports lalu Transactions.",
      "Pilih outlet dan rentang tanggal, lalu klik Export.",
      "Jika hasilnya ZIP, ekstrak lalu pilih Excel atau CSV yang berisi rincian transaksi.",
    ],
    url: "https://help.mokapos.com/materi-10-melihat-analisis-dashboard-dan-reports-di-backoffice",
    link: "Buka panduan resmi Moka",
  },
} as const;

export type ImportVendor = keyof typeof vendors;

export function VendorImportGuide({
  open,
}: {
  open: (vendor: ImportVendor) => void;
}) {
  return (
    <div className="vendor-guide">
      {(
        Object.entries(vendors) as [
          ImportVendor,
          (typeof vendors)[ImportVendor],
        ][]
      ).map(([vendor, { steps, url, link }]) => (
        <section key={vendor}>
          <h3>{vendor}</h3>
          <ol>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>
            <a href={url} target="_blank" rel="noreferrer">
              {link} ↗
            </a>
          </p>
          <button
            className="button outline"
            type="button"
            onClick={() => open(vendor)}
          >
            Impor laporan {vendor}
          </button>
        </section>
      ))}
    </div>
  );
}
