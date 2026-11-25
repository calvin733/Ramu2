export function FeatureLoading({
  title = "Memuat halaman",
}: {
  title?: string;
}) {
  return (
    <section className="feature-loading" role="status" aria-busy="true">
      <h1>{title}</h1>
      <p>Menyiapkan tampilan...</p>
      <div className="feature-loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
