import Link from "next/link";

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="RAMU, halaman awal">
      ramu
    </Link>
  );
}

export function Splash() {
  return (
    <section className="splash" role="status" aria-live="polite">
      <div className="splash-identity">
        <div className="splash-lockup" aria-label="RAMU">
          <span className="measuring-tubes" aria-hidden="true">
            <i>
              <span />
            </i>
            <i>
              <span />
            </i>
            <i>
              <span />
            </i>
          </span>
          <span className="splash-wordmark" aria-hidden="true">
            ramu
          </span>
        </div>
      </div>
      <div className="splash-status">
        <i aria-hidden="true" />
        Menyiapkan RAMU…
      </div>
    </section>
  );
}
