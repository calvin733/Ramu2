import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const env = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const { chatModelStatus, composeChat } =
  await import("../src/server/chat-model.ts");
const { analyzeChat } = await import("../src/domain/chat-analysis.ts");
const { dateSelection } = await import("../src/domain/chat-context.ts");
const { demoSalesReport } = await import("../src/demo/sales-report.ts");
const { periodParams } = await import("../src/domain/sales.ts");
const { demoAsOf } = await import("../src/demo/fixture.ts");
if (
  chatModelStatus(true) !== "ready" ||
  process.env.GEMINI_SERVICE_TIER !== "unpaid"
) {
  console.error(
    "Uji sintetis gratis belum siap. Gunakan API key server, GEMINI_SERVICE_TIER=unpaid, GEMINI_DEMO_ENABLED=true dan model free tier yang didukung. Key tidak dicetak.",
  );
  process.exitCode = 2;
} else {
  const questions = [
    "Bagaimana penjualan bulan ini?",
    "Bandingkan dengan bulan lalu.",
    "Kenapa turun?",
    "Apa langkah pertama saya?",
    "Apa beda omzet dan laba?",
    "Jelaskan lebih sederhana.",
  ];
  const memory = [];
  let previous;
  for (const question of questions) {
    const selection = dateSelection(
      question,
      previous ?? { period: demoSalesReport({}).period },
      demoAsOf,
    );
    const filters = Object.fromEntries(periodParams(selection.period));
    if (selection.range)
      Object.assign(filters, {
        awal: selection.range.start,
        akhir: selection.range.end,
        bandingAwal: selection.comparison?.start,
        bandingAkhir: selection.comparison?.end,
      });
    const { report } = demoSalesReport(filters);
    const answer = analyzeChat({
      question,
      previous,
      selection,
      report,
      sourceHref: "/demo/sumber-data",
      evidenceHref: () => "/demo/harian",
    });
    const start = performance.now();
    const result = await composeChat({
      question,
      answer,
      memory: memory.slice(-4),
      catalog: report?.products?.map((item) => item.name) ?? [],
      demo: true,
      signal: AbortSignal.timeout(20_000),
    });
    console.log(
      JSON.stringify({
        question,
        provider: result.provider,
        elapsedMs: Math.round(performance.now() - start),
        ...(result.provider === "gemini"
          ? { answer: result.summary }
          : { notice: result.providerNotice }),
      }),
    );
    if (result.provider !== "gemini") {
      process.exitCode = 1;
      break;
    }
    memory.push({
      question,
      answer: result.summary,
      intent: answer.context.intent,
    });
    previous = answer.context;
  }
  console.log(
    "Hanya fixture server sintetis dipakai. Mode data usaha asli dan billing tidak diubah.",
  );
}
