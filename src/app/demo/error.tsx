"use client";

import Link from "next/link";

export default function DemoError({ reset }: { reset: () => void }) {
  return (
    <section className="state-panel" role="alert">
      <h1>Data contoh belum bisa dimuat</h1>
      <p>Coba muat ulang Dashboard.</p>
      <div className="state-actions">
        <button className="button primary" type="button" onClick={reset}>
          Coba lagi
        </button>
        <Link className="button quiet" href="/">
          Ke halaman awal
        </Link>
      </div>
    </section>
  );
}
