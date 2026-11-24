import { notFound } from "next/navigation";
import { AnalysisReadiness } from "@/components/analysis-readiness";
import { SourceOptions } from "@/components/source-options";
import { demoBusiness, demoSales, demoSource } from "@/demo/fixture";
import { formatFullDate } from "@/domain/sales";

export default async function DemoFeature({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  if ((await params).feature !== "sumber-data") notFound();
  return (
    <section className="business-stack sources-page">
      <h1>Sumber data</h1>
      <div className="source-active">
        <div className="source-active-heading">
          <h2>Penjualan {demoBusiness}</h2>
          <span>Data contoh</span>
        </div>
        <p>{demoSource}</p>
        <p>Data sampai {formatFullDate(demoSales.coverage.end)}</p>
      </div>
      <div>
        <h2 className="source-options-heading">Pilihan sumber penjualan</h2>
        <SourceOptions demo sheetsConfig={null} />
      </div>
      <AnalysisReadiness sales orders products demo />
    </section>
  );
}
