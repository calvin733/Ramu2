"use client";

export default function BusinessError({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-state">
      <h1>Data usaha belum dapat dimuat</h1>
      <p>Periksa koneksi dan coba lagi.</p>
      <button className="button primary" onClick={reset}>
        Coba lagi
      </button>
    </main>
  );
}
