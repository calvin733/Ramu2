"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

const requirements = {
  cash: {
    title: "Kebutuhan data arus kas",
    description:
      "Siapkan saldo awal serta catatan uang masuk dan keluar dengan tanggal transaksi untuk analisis arus kas. Data ini belum tersedia dari impor penjualan.",
  },
  stock: {
    title: "Kebutuhan data stok",
    description:
      "Siapkan nama produk, stok awal, stok masuk dan stok keluar agar ketersediaan bisa dinilai. Data ini belum tersedia dari impor penjualan.",
  },
};

export function AnalysisReadiness({
  sales,
  orders,
  products,
  demo = false,
}: {
  sales: boolean;
  orders: boolean;
  products: boolean;
  demo?: boolean;
}) {
  const [topic, setTopic] = useState<keyof typeof requirements>("cash");
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const rows = [
    { name: "Penjualan", detail: "Tanggal dan nilai transaksi", ready: sales },
    {
      name: "Pesanan & produk",
      detail: "ID pesanan dan nama produk",
      ready: orders && products,
      status: orders
        ? "Produk belum tersedia"
        : products
          ? "ID pesanan belum tersedia"
          : "Belum tersedia",
    },
  ];

  function show(next: keyof typeof requirements) {
    setTopic(next);
    dialog.current?.showModal();
  }

  return (
    <section aria-labelledby="readiness-title">
      <h2 id="readiness-title">Kesiapan analisis</h2>
      <p className="readiness-hint">
        Data tambahan ini opsional. Lengkapi sesuai analisis yang Anda perlukan.
      </p>
      <dl className="readiness-list">
        {rows.map((row) => (
          <div key={row.name}>
            <dt>{row.name}</dt>
            <dd>{row.detail}</dd>
            <dd className={row.ready ? "ready" : undefined}>
              {row.ready
                ? "✓ Siap"
                : "status" in row
                  ? row.status
                  : "Belum tersedia"}
            </dd>
          </div>
        ))}
        <div>
          <dt>Laba</dt>
          <dd>Biaya produk untuk menghitung laba.</dd>
          <dd>
            <Link
              href={
                demo
                  ? "/masuk?lanjut=%2Fsumber-data%2Fbiaya"
                  : "/sumber-data/biaya"
              }
            >
              Lihat kebutuhan biaya →
            </Link>
          </dd>
        </div>
        <div>
          <dt>Uang & kas</dt>
          <dd>
            Catatan uang masuk, uang keluar, dan saldo awal untuk arus kas.
          </dd>
          <dd>
            <button
              type="button"
              className="readiness-action"
              onClick={() => show("cash")}
            >
              Lihat kebutuhan arus kas →
            </button>
          </dd>
        </div>
        <div>
          <dt>Stok</dt>
          <dd>Catatan jumlah persediaan untuk melihat stok.</dd>
          <dd>
            <button
              type="button"
              className="readiness-action"
              onClick={() => show("stock")}
            >
              Lihat kebutuhan persediaan →
            </button>
          </dd>
        </div>
      </dl>
      <p className="readiness-caption">
        RAMU hanya meminta konfirmasi untuk kolom relevan yang masih ambigu.
      </p>
      <dialog
        ref={dialog}
        className="calculation-dialog readiness-dialog"
        aria-labelledby={id}
      >
        <h2 id={id}>{requirements[topic].title}</h2>
        <p>{requirements[topic].description}</p>
        <button
          type="button"
          className="button outline"
          onClick={() => dialog.current?.close()}
        >
          Tutup
        </button>
      </dialog>
    </section>
  );
}
