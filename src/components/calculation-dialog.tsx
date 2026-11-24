"use client";

import { useId, useRef } from "react";

export function CalculationDialog({ basis }: { basis?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <>
      <button
        className="chart-link"
        type="button"
        onClick={() => dialog.current?.showModal()}
      >
        Cara dihitung
      </button>
      <dialog
        ref={dialog}
        className="calculation-dialog"
        aria-labelledby={title}
      >
        <h2 id={title}>Cara RAMU menghitung</h2>
        <dl>
          <div>
            <dt>Penjualan</dt>
            <dd>
              Total nilai penjualan selama tanggal yang tercakup.
              {basis &&
                ` Dasar nilai: ${basis}. Retur mengurangi total penjualan.`}
            </dd>
          </div>
          <div>
            <dt>Pesanan</dt>
            <dd>
              Jumlah ID pesanan selesai yang unik dalam periode yang
              ditampilkan.
            </dd>
          </div>
          <div>
            <dt>Rata-rata per pesanan</dt>
            <dd>
              Total penjualan dibagi jumlah pesanan pada periode yang sama.
            </dd>
          </div>
          <div>
            <dt>Perubahan periode</dt>
            <dd>
              Periode berjalan dibandingkan sampai tanggal kalender yang setara.
              Periode lengkap dibandingkan dengan periode sebelumnya.
            </dd>
          </div>
        </dl>
        <form method="dialog">
          <button className="button primary" type="submit">
            Tutup
          </button>
        </form>
      </dialog>
    </>
  );
}
