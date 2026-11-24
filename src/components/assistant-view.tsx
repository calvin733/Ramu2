import {
  ArrowUpRight,
  Database,
  MessageCircleMore,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { askAssistant } from "@/app/assistant-actions";
import { demoSource } from "@/demo/fixture";
import {
  assistantAnswer,
  assistantQuestions,
  readIntent,
} from "@/domain/assistant";
import {
  formatRange,
  periodLabel,
  periodParams,
  type DateRange,
  type Period,
  type SearchParams,
} from "@/domain/sales";
import type { SalesReport } from "@/domain/sales-report";
import {
  assistantPaths,
  assistantQuery,
  productKey,
  selectedProducts,
  type AssistantScope,
} from "@/server/assistant-links";
import type { SalesRevision } from "@/server/sales-revisions";
import { AssistantComposer } from "./assistant-composer";
import { PeriodControls } from "./period-controls";
import { sourceLabel } from "./sales-source";

type AssistantProps = {
  scope: AssistantScope;
  params: SearchParams;
  period: Period;
  coverage: DateRange | null;
  revision: SalesRevision | null;
  report: SalesReport | null;
};

export function AssistantView({
  scope,
  params,
  period,
  coverage,
  revision,
  report,
}: AssistantProps) {
  const paths = assistantPaths[scope];
  const demo = scope === "demo";
  const intent = readIntent(params.tanya);
  const pair = intent === "compare" ? selectedProducts(params) : [];
  const choice = !demo && params.revisi !== undefined;
  const context = { period, revisionId: revision?.id };
  const start = assistantQuery(context);
  const sourceHref =
    paths.source +
    "?" +
    periodParams(period) +
    (demo ? "" : "#readiness-title");
  const source = demo
    ? "Data contoh · " + demoSource
    : revision
      ? sourceLabel(revision)
      : "Belum ada sumber data";
  const products = (report?.products ?? []).map(({ name }) => ({
    name,
    key: productKey(name),
  }));
  const names = pair.map(
    (key) => products.find((product) => product.key === key)?.name ?? "",
  );
  const answer = intent ? assistantAnswer(intent, report, names) : null;
  const evidence = answer?.evidence;
  const evidenceQuery = assistantQuery({ ...context, intent, pair });
  evidenceQuery.set("asal", "asisten");
  if (evidence?.kind === "time" && evidence.date)
    evidenceQuery.set("rincian", "harian");
  const evidenceHref = evidence
    ? paths.evidence +
      (evidence.kind === "time" ? "/harian" : "/produk") +
      "?" +
      evidenceQuery +
      (evidence.kind === "time"
        ? evidence.date
          ? "#hari-" + evidence.date
          : ""
        : evidence.names[0]
          ? "#produk-" + productKey(evidence.names[0])
          : "")
    : null;
  const question =
    intent === "profit"
      ? "Berapa laba usaha saya?"
      : intent && intent !== "unsupported"
        ? assistantQuestions[intent]
        : null;
  const ask = askAssistant.bind(null, scope, period, revision?.id ?? null);
  const format = report
    ? formatRange(report.active, true)
    : periodLabel(period);

  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-header" id="periode-asisten">
        <div>
          <h1 id="assistant-title">Asisten</h1>
          <p className="assistant-source">
            <Database size={15} aria-hidden="true" /> <span>{source}</span>
          </p>
          <p>{format}</p>
        </div>
        {coverage && (
          <PeriodControls
            label="Pilih periode Asisten"
            period={period}
            coverage={coverage}
          />
        )}
      </header>

      {choice && !revision ? (
        <section className="state-panel">
          <h2>Revisi penjualan tidak tersedia</h2>
          <p>Buka Asisten dengan sumber penjualan yang saat ini digunakan.</p>
          <Link className="button outline" href={paths.page}>
            Buka data terbaru
          </Link>
        </section>
      ) : !coverage ? (
        <section className="state-panel">
          <h2>Hubungkan data untuk mulai bertanya</h2>
          <p>
            Impor Excel atau CSV agar Asisten bisa menjawab dengan angka
            penjualan Anda.
          </p>
          <Link className="button primary" href={paths.source}>
            Hubungkan data
          </Link>
          <Link className="button outline" href="/demo/asisten">
            Coba data contoh
          </Link>
        </section>
      ) : (
        <>
          {revision && (!revision.isActive || revision.source.paused_at) && (
            <p className="form-message">
              {revision.isActive
                ? "Sumber nonaktif. Asisten memakai data terakhir."
                : "Asisten memakai revisi sebelumnya."}
              {!revision.isActive && (
                <>
                  {" "}
                  <Link href={paths.page + "?" + periodParams(period)}>
                    Buka data terbaru
                  </Link>
                </>
              )}
            </p>
          )}
          <div
            className={
              answer ? "assistant-thread" : "assistant-thread assistant-welcome"
            }
          >
            {answer ? (
              <>
                {question && <p className="assistant-question">{question}</p>}
                <article
                  className="assistant-answer"
                  aria-labelledby="assistant-answer-title"
                >
                  <div className="assistant-answer-heading">
                    <span className="assistant-avatar">
                      <MessageCircleMore size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <p>RAMU</p>
                      <h2 id="assistant-answer-title">{answer.title}</h2>
                    </div>
                  </div>
                  <p>{answer.summary}</p>
                  {answer.metrics && (
                    <dl className="assistant-metrics">
                      {answer.metrics.map(({ label, value }, index) => (
                        <div key={index}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {answer.recovery === "products" && (
                    <form
                      className="assistant-product-form"
                      action={paths.page}
                      method="get"
                    >
                      {Array.from(assistantQuery({ ...context, intent })).map(
                        ([key, value]) => (
                          <input
                            key={key}
                            type="hidden"
                            name={key}
                            value={value}
                          />
                        ),
                      )}
                      {[0, 1].map((index) => (
                        <label key={index}>
                          Produk {index + 1}
                          <select
                            required
                            name={"produk" + (index + 1)}
                            defaultValue={
                              products.some(({ key }) => key === pair[index])
                                ? pair[index]
                                : ""
                            }
                          >
                            <option value="" disabled>
                              Pilih produk
                            </option>
                            {products.map(({ name, key }) => (
                              <option key={key} value={key}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <button className="button primary" type="submit">
                        Bandingkan
                      </button>
                    </form>
                  )}
                  {answer.suggestion && (
                    <div className="assistant-suggestion">
                      <h3>Saran untuk diperiksa</h3>
                      <p>{answer.suggestion}</p>
                    </div>
                  )}
                  {answer.metrics && report && (
                    <p className="assistant-answer-source">
                      {format}
                      {(intent === "growth" || intent === "decline") &&
                        report.comparison && (
                          <>
                            {" "}
                            dibanding{" "}
                            {formatRange(report.comparison.range, true)}
                          </>
                        )}
                      {" · "}
                      {source}
                    </p>
                  )}
                  {(evidenceHref ||
                    answer.recovery === "period" ||
                    answer.recovery === "source" ||
                    answer.compared) && (
                    <div className="assistant-answer-links">
                      {evidenceHref && (
                        <Link href={evidenceHref} prefetch={false}>
                          {evidence?.kind === "time"
                            ? "Lihat bukti penjualan"
                            : "Lihat bukti per produk"}{" "}
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </Link>
                      )}
                      {answer.recovery === "period" && (
                        <Link href="#periode-asisten">Pilih periode lain</Link>
                      )}
                      {answer.recovery === "source" && (
                        <Link href={sourceHref}>
                          Periksa sumber data{" "}
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </Link>
                      )}
                      {answer.compared && (
                        <Link
                          href={
                            paths.page +
                            "?" +
                            assistantQuery({ ...context, intent: "compare" })
                          }
                        >
                          Ganti produk
                        </Link>
                      )}
                    </div>
                  )}
                </article>
              </>
            ) : (
              <h2>Apa yang ingin Anda ketahui?</h2>
            )}
            <AssistantComposer key={evidenceQuery.toString()} ask={ask} />
            <nav className="assistant-options" aria-label="Saran pertanyaan">
              {Object.entries(assistantQuestions).map(([key, label]) => {
                const query = new URLSearchParams(start);
                query.set("tanya", key);
                return (
                  <Link
                    key={key}
                    href={paths.page + "?" + query}
                    prefetch={false}
                    aria-current={intent === key ? "true" : undefined}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </section>
  );
}

export function AssistantLoadError({ href }: { href: string }) {
  return (
    <>
      <header className="assistant-header">
        <h1>Asisten</h1>
      </header>
      <section className="state-panel">
        <h2>Data belum bisa dimuat</h2>
        <p>Coba muat kembali pertanyaan dan sumber penjualannya.</p>
        <a href={href} className="button outline">
          <RefreshCw size={16} aria-hidden="true" /> Coba lagi
        </a>
      </section>
    </>
  );
}
