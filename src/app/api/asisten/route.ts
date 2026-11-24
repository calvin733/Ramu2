import { demoAsOf, demoSales, demoSource } from "@/demo/fixture";
import { demoSalesReport } from "@/demo/sales-report";
import { analyzeChat } from "@/domain/chat-analysis";
import {
  dateSelection,
  interpretChat,
  type ChatTurn,
} from "@/domain/chat-context";
import { businessDate } from "@/domain/sales-report";
import {
  intersect,
  periodParams,
  rangeForPeriod,
  readPeriod,
  type SearchParams,
} from "@/domain/sales";
import { activeTarget, targetProgress } from "@/domain/targets";
import { currentAccount, currentBusiness, uuidPattern } from "@/server/account";
import { businessCosts } from "@/server/business-costs";
import { businessSales } from "@/server/business-sales";
import {
  businessTargetResults,
  businessTargets,
} from "@/server/business-targets";
import {
  appendTurn,
  deleteConversation,
  readConversation,
} from "@/server/chat-conversations";
import {
  chatModelStatus,
  composeChat,
  inferChatIntent,
} from "@/server/chat-model";
import { allowChatModel } from "@/server/chat-rate-limit";
import { sensitiveChatInput, type ChatMemory } from "@/domain/chat-grounding";
import {
  demoChatSession,
  demoTurnReceipt,
  verifiedDemoHistory,
} from "@/server/demo-chat-session";
import { readDemoTargets } from "@/server/demo-targets";
import { revisionFacts, salesRevision } from "@/server/sales-revisions";
import { sameOriginRequest } from "@/server/request-origin";

const problem = (message: string, status: number) =>
  Response.json({ error: message }, { status });
const validId = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

async function ownedScope() {
  const account = await currentAccount();
  const business = account ? await currentBusiness(account) : null;
  return account && business
    ? { token: account.token, businessId: business.id, business, account }
    : null;
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request))
    return problem("Asal permintaan tidak sesuai.", 403);
  try {
    const scope = await ownedScope();
    if (!scope)
      return problem("Masuk kembali untuk menghapus percakapan.", 401);
    const id = new URL(request.url).searchParams.get("id");
    if (!validId(id)) return problem("Percakapan tidak tersedia.", 400);
    await deleteConversation(scope, id);
    return new Response(null, { status: 204 });
  } catch {
    return problem("Percakapan belum dapat dihapus. Coba lagi.", 503);
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return problem("Asal permintaan tidak sesuai.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return problem("Gunakan format JSON untuk pertanyaan.", 415);
  if (Number(request.headers.get("content-length")) > 140_000)
    return problem("Permintaan terlalu panjang.", 413);
  const raw = await request.text().catch(() => "");
  if (raw.length > 140_000) return problem("Permintaan terlalu panjang.", 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (
    !body ||
    !validId(body.id) ||
    !validId(body.requestId) ||
    typeof body.question !== "string" ||
    !body.question.trim() ||
    body.question.length > 700 ||
    typeof body.demo !== "boolean"
  )
    return problem("Tulis pertanyaan sepanjang 1 sampai 700 karakter.", 400);
  const demo = new URL(request.url).pathname === "/demo/asisten/percakapan";
  if (body.demo !== demo)
    return problem("Mode data tidak sesuai dengan alamat percakapan.", 400);
  if (demo && sensitiveChatInput(body.question))
    return problem(
      "Gunakan pertanyaan nonrahasia tentang data contoh. Hapus data pribadi, key, atau informasi usaha asli dari pesan.",
      400,
    );
  const demoSession = demo ? demoChatSession(request) : null;
  const demoHistory = demoSession
    ? verifiedDemoHistory(demoSession.id, body.id, body.history)
    : null;
  if (demo && !demoHistory)
    return problem(
      "Riwayat demo belum dapat diverifikasi. Mulai percakapan baru untuk melanjutkan.",
      400,
    );
  let scope;
  try {
    scope = demo ? null : await ownedScope();
    if (!demo && !scope)
      return problem(
        "Sesi berakhir. Masuk kembali untuk meneruskan percakapan.",
        401,
      );
  } catch {
    return problem("Sesi belum dapat diperiksa. Coba lagi.", 503);
  }
  const { id, requestId } = body as { id: string; requestId: string };
  const question: string = body.question.trim();
  const encoder = new TextEncoder();
  const aborter = new AbortController();
  const signal = AbortSignal.any([
    request.signal,
    aborter.signal,
    AbortSignal.timeout(40_000),
  ]);
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (message: unknown) => {
        if (!signal.aborted)
          controller.enqueue(encoder.encode(JSON.stringify(message) + "\n"));
      };
      try {
        emit({ status: "Memeriksa konteks percakapan…" });
        const previous = scope
          ? await readConversation(scope, id)
          : demoHistory?.turns.length
            ? {
                id,
                title: demoHistory.turns[0].question.slice(0, 100),
                turns: demoHistory.turns,
                version: demoHistory.version,
              }
            : null;
        const duplicate = previous?.turns.find((turn) => turn.id === requestId);
        if (duplicate) {
          emit({
            turn: duplicate,
            title: previous?.title,
            version: previous?.version,
          });
          return;
        }
        if (scope && body.version !== (previous?.version ?? 0)) {
          emit({
            error:
              "Percakapan berubah di tab lain. Muat ulang sebelum mengirim.",
            reload: true,
          });
          return;
        }
        if (
          ((demo ? demoHistory?.version : previous?.turns.length) ?? 0) >= 24
        ) {
          emit({
            error:
              "Percakapan mencapai 24 giliran. Mulai percakapan baru untuk melanjutkan.",
          });
          return;
        }
        const revision = scope ? await salesRevision(undefined, scope) : null;
        const today = scope ? businessDate(scope.business.timezone) : demoAsOf;
        const last = previous?.turns.at(-1)?.answer.context;
        const defaultDate = revision?.covered_through ?? today;
        const base = last ?? {
          period: readPeriod(body.filters ?? {}, defaultDate),
        };
        const selection = dateSelection(
          question.toLocaleLowerCase("id"),
          base,
          today,
        );
        const filters: SearchParams = Object.fromEntries(
          periodParams(selection.period),
        );
        if (selection.range) {
          filters.awal = selection.range.start;
          filters.akhir = selection.range.end;
          filters.bandingAwal = selection.comparison?.start;
          filters.bandingAkhir = selection.comparison?.end;
        }
        if (revision) filters.revisi = revision.id;
        emit({ status: "Mengambil angka dari sumber penjualan…" });
        const facts =
          revision && scope ? await revisionFacts(revision.id, scope) : [];
        const { report } = demo
          ? demoSalesReport(filters)
          : await businessSales(filters, true, {
              scope: scope!,
              revision,
              facts,
            });
        const catalog = [
          ...new Set([
            ...(report?.products?.map(({ name }) => name) ?? []),
            ...(last?.products ?? []),
            ...(last?.product ? [last.product] : []),
            ...(previous?.turns
              .slice(-4)
              .flatMap((turn) => [
                ...turn.answer.context.products,
                ...(turn.answer.context.product
                  ? [turn.answer.context.product]
                  : []),
              ]) ?? []),
          ]),
        ];
        const memory: ChatMemory = (previous?.turns ?? [])
          .slice(-4)
          .map((turn) => ({
            question: turn.question,
            answer: turn.answer.summary,
            intent: turn.answer.context.intent,
          }));
        const modelOptions = {
          demo,
          memory,
          catalog,
          privateNames: scope ? [scope.business.name] : [],
        };
        const modelAllowed =
          chatModelStatus(demo) === "ready" &&
          allowChatModel(scope?.businessId ?? "demo:" + demoSession!.id, demo);
        const preliminary = interpretChat(question, last, catalog);
        const model =
          (preliminary.intent === "unsupported" ||
            (preliminary.intent === "products" &&
              !preliminary.ranking &&
              !preliminary.product &&
              !/\b(tampilkan|daftar|lihat)\b/i.test(question)) ||
            (preliminary.intent === "advice" &&
              /\b(produk|barang|menu|varian)\b/i.test(question))) &&
          modelAllowed &&
          !preliminary.missingCash &&
          !preliminary.missingStock
            ? await inferChatIntent(question, signal, modelOptions)
            : {
                provider: "basic" as const,
                intent: undefined,
                ranking: undefined,
                includeAdvice: undefined,
              };
        const intent = model.intent ?? preliminary.intent;
        const [costs, targets] = await Promise.all([
          scope && ["profit", "gross", "overview", "advice"].includes(intent)
            ? businessCosts(scope)
            : Promise.resolve([]),
          ["target", "overview", "advice"].includes(intent)
            ? demo
              ? readDemoTargets()
              : businessTargets(scope!)
            : Promise.resolve([]),
        ]);
        const target = targets
          .filter(
            (item) =>
              item.kind === "revenue" &&
              intersect(
                item.range,
                selection.range ?? rangeForPeriod(selection.period),
              ),
          )
          .sort(
            (a, b) =>
              Number(activeTarget(b, today)) - Number(activeTarget(a, today)) ||
              Number(Boolean(b.primary)) - Number(Boolean(a.primary)) ||
              b.range.end.localeCompare(a.range.end),
          )[0];
        const simulated = target && {
          ...target,
          sellingDays: preliminary.sellingDays ?? target.sellingDays,
        };
        const targetEntry =
          simulated &&
          (demo
            ? {
                target: simulated,
                progress: targetProgress(simulated, demoSales, demoAsOf),
              }
            : (
                await businessTargetResults([simulated], today, revision, {
                  facts,
                  scope: scope!,
                })
              )[0]);
        const prefix = demo ? "/demo" : "/dashboard";
        const proof = new URLSearchParams(periodParams(selection.period));
        for (const [key, value] of Object.entries(filters))
          if (typeof value === "string") proof.set(key, value);
        proof.set("asal", "percakapan");
        proof.set("percakapan", id);
        proof.set("pesan", requestId);
        const sourceHref = demo
          ? "/demo/sumber-data"
          : "/sumber-data#readiness-title";
        const answer = analyzeChat({
          question,
          selection,
          report,
          previous: last,
          costs,
          inferred: model.intent,
          request: {
            ...interpretChat(question, last, catalog, model.intent),
            ...(model.ranking && !preliminary.ranking
              ? {
                  intent: "products",
                  ranking: model.ranking,
                  product: undefined,
                }
              : {}),
            includeAdvice:
              preliminary.includeAdvice || Boolean(model.includeAdvice),
          },
          source: demo
            ? "Data contoh · " + demoSource
            : revision
              ? revision.source.kind.replace("google_sheets", "Google Sheets") +
                " · " +
                revision.source.name
              : undefined,
          sourceHref,
          targetProgress: () => targetEntry || undefined,
          evidenceHref: (kind, date) => {
            const query = new URLSearchParams(proof);
            if (date) query.set("rincian", "harian");
            return (
              prefix +
              (kind === "product" ? "/produk?" : "/harian?") +
              query +
              (date ? "#hari-" + date : "")
            );
          },
        });
        if (modelAllowed && model.provider !== "limited") {
          emit({ status: "RAMU sedang menyusun penjelasan." });
          const narration = await composeChat({
            question,
            answer,
            ...modelOptions,
            signal,
          });
          if (narration.summary) answer.analysisSummary = answer.summary;
          Object.assign(answer, narration);
        } else if (chatModelStatus(demo) === "ready") {
          answer.provider = "limited";
          answer.providerNotice =
            model.provider === "limited"
              ? "Gemini sedang tidak tersedia. Jawaban memakai analisis dasar RAMU."
              : "Batas permintaan Gemini sementara tercapai. Analisis dasar tetap tersedia.";
        } else
          Object.assign(
            answer,
            await composeChat({ question, answer, ...modelOptions, signal }),
          );
        if (
          scope &&
          previous?.turns.at(-1)?.answer.evidence &&
          revision &&
          new URL(
            previous.turns.at(-1)!.answer.evidence!,
            request.url,
          ).searchParams.get("revisi") !== revision.id
        )
          answer.advice = [
            "Jawaban ini memakai revisi terbaru. Bukti pesan lama tetap memakai revisinya.",
            answer.advice,
          ]
            .filter(Boolean)
            .join(" ");
        const turn: ChatTurn = { id: requestId, question, answer };
        emit({ status: "Memeriksa angka dan tautan bukti…" });
        if (signal.aborted) return;
        if (scope) {
          const saved = await appendTurn(scope, id, previous, turn);
          if (!saved) {
            const current = await readConversation(scope, id);
            const replay = current?.turns.find((item) => item.id === turn.id);
            if (replay) {
              emit({
                turn: replay,
                title: current?.title,
                version: current?.version,
              });
              return;
            }
            emit({
              error:
                "Percakapan berubah di tab lain. Muat ulang sebelum mengirim.",
              reload: true,
            });
            return;
          }
          emit({ turn, title: saved.title, version: saved.version });
        } else {
          const version = (demoHistory?.version ?? 0) + 1;
          turn.demoReceipt = demoTurnReceipt(
            demoSession!.id,
            id,
            turn,
            version,
          );
          emit({
            turn,
            title: previous?.title ?? question.slice(0, 100),
            version,
          });
        }
      } catch {
        emit({
          error:
            "Jawaban belum dapat diselesaikan. Pertanyaan tetap tersimpan di draf. Coba lagi.",
        });
      } finally {
        if (!aborter.signal.aborted) controller.close();
      }
    },
    cancel() {
      aborter.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      ...(demoSession?.cookie ? { "set-cookie": demoSession.cookie } : {}),
    },
  });
}
