"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/domain/chat-context";
import type { Conversation } from "@/server/chat-conversations";
import "./chat-view.css";

const demoKey = "ramu-percakapan-demo-v1";
const starters = [
  "Bagaimana penjualan bulan ini?",
  "Produk mana yang paling tidak laris?",
  "Apa langkah yang bisa saya ambil?",
];
type HistoryItem = Pick<Conversation, "id" | "title">;
type Event = {
  status?: string;
  error?: string;
  reload?: boolean;
  turn?: ChatTurn;
  title?: string;
  version?: number;
};

function demoThreads(): Conversation[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(demoKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function ChatView({
  demo,
  initial,
  history,
  initialId,
  filters,
  limited,
  rangeLabel,
  connection,
}: {
  demo: boolean;
  initial: Conversation | null;
  history: HistoryItem[];
  initialId?: string;
  filters: { periode?: string; tampilan?: string };
  limited: boolean;
  rangeLabel?: string;
  connection?: string;
}) {
  const path = demo ? "/demo/asisten" : "/asisten";
  const api = demo ? "/demo/asisten/percakapan" : "/api/asisten";
  const [thread, setThread] = useState(initial);
  const [items, setItems] = useState(history);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const stop = useRef<AbortController | null>(null);
  const draftId = useRef<{
    question: string;
    id: string;
    thread: string;
  } | null>(null);
  const last = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const messagePane = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const userScrolled = useRef(false);
  const turns = thread?.turns ?? [];
  const activeId = thread?.id;

  useEffect(() => {
    if (demo) {
      const saved = demoThreads();
      setItems(saved);
      setThread(saved.find((item) => item.id === initialId) ?? null);
    }
    const part = window.location.hash;
    if (part.startsWith("#pesan-")) {
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(part.slice(1))
          ?.scrollIntoView({ block: "start" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [demo, initialId]);
  useEffect(() => () => stop.current?.abort(), []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const measure = () => {
      const element = page.current;
      if (!element) return;
      const available =
        (viewport?.height ?? window.innerHeight) -
        Math.max(0, element.getBoundingClientRect().top) -
        16;
      element.style.setProperty(
        "--conversation-height",
        `${Math.max(160, available + 16)}px`,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
    };
  }, [turns.length, submitted]);
  useEffect(() => {
    const pane = messagePane.current;
    if (!pane || (!turns.length && !submitted)) return;
    const follow = () => {
      if (pinned.current) latest();
    };
    const observer = new ResizeObserver(follow);
    observer.observe(pane);
    for (const child of pane.children) observer.observe(child);
    follow();
    return () => {
      observer.disconnect();
    };
  }, [pending, turns.length, submitted]);

  useEffect(() => {
    const input = composer.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = Math.min(144, input.scrollHeight) + "px";
    }
  }, [draft]);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  function latest() {
    userScrolled.current = false;
    const pane = messagePane.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
    pinned.current = true;
    setShowLatest(false);
  }

  function threadHref(id?: string) {
    const query = new URLSearchParams();
    if (filters.periode) query.set("periode", filters.periode);
    if (filters.tampilan) query.set("tampilan", filters.tampilan);
    if (id) query.set("percakapan", id);
    return query.size ? path + "?" + query : path;
  }

  function saveThread(next: Conversation) {
    const follow = pinned.current;
    setThread(next);
    setItems((all) =>
      [
        { id: next.id, title: next.title },
        ...all.filter((item) => item.id !== next.id),
      ].slice(0, 30),
    );
    if (demo) {
      try {
        sessionStorage.setItem(
          demoKey,
          JSON.stringify(
            [
              next,
              ...demoThreads().filter((item) => item.id !== next.id),
            ].slice(0, 12),
          ),
        );
      } catch {
        setError(
          "Penyimpanan sesi demo penuh. Percakapan masih terlihat pada halaman ini.",
        );
      }
    }
    window.history.replaceState(null, "", threadHref(next.id));
    requestAnimationFrame(() => {
      if (follow) latest();
      else setShowLatest(true);
    });
  }

  async function send(value = draft) {
    const question = value.trim();
    if (!question || question.length > 700 || stop.current) return;
    if (turns.length >= 24) {
      setError(
        "Percakapan mencapai 24 giliran. Mulai percakapan baru untuk melanjutkan.",
      );
      return;
    }
    const current =
      draftId.current?.question === question
        ? draftId.current
        : {
            question,
            id: crypto.randomUUID(),
            thread: activeId ?? crypto.randomUUID(),
          };
    draftId.current = current;
    setSubmitted(question);
    userScrolled.current = false;
    pinned.current = true;
    setDraft("");
    setError("");
    setReload(false);
    setPending("Mengirim pertanyaan...");
    const controller = new AbortController();
    stop.current = controller;
    try {
      const response = await fetch(api, {
        method: "POST",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(45_000),
        ]),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: current.thread,
          requestId: current.id,
          question,
          demo,
          filters,
          version: thread?.version ?? 0,
          context: demo ? turns.at(-1)?.answer.context : undefined,
          history: demo
            ? turns
                .slice(-4)
                .map((turn) => turn.demoReceipt)
                .filter(
                  (receipt): receipt is string => typeof receipt === "string",
                )
            : undefined,
        }),
      });
      if (!response.ok) {
        const item = (await response.json().catch(() => ({}))) as Event;
        throw new Error(item.error ?? "Pertanyaan belum dapat dikirim.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Jawaban kosong. Coba lagi.");
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let received = 0;
      try {
        while (true) {
          const item = await reader.read();
          received += item.value?.byteLength ?? 0;
          if (received > 160_000)
            throw new Error(
              "Jawaban terlalu panjang. Coba pertanyaan yang lebih spesifik.",
            );
          buffer += item.done
            ? decoder.decode()
            : decoder.decode(item.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          if (item.done && buffer.trim()) {
            lines.push(buffer);
            buffer = "";
          }
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: Event;
            try {
              event = JSON.parse(line) as Event;
            } catch {
              throw new Error(
                "Koneksi mengirim jawaban yang tidak lengkap. Coba lagi.",
              );
            }
            if (!event || typeof event !== "object")
              throw new Error("Jawaban belum dapat dibaca. Coba lagi.");
            if (event.status) setPending(event.status);
            if (event.error) {
              setReload(Boolean(event.reload));
              throw new Error(event.error);
            }
            if (!event.turn || controller.signal.aborted) continue;
            saveThread({
              id: current.thread,
              title: event.title ?? thread?.title ?? question.slice(0, 100),
              version: event.version ?? 0,
              turns: [
                ...turns.filter((turn) => turn.id !== event.turn?.id),
                event.turn,
              ].slice(-24),
            });
            setDraft("");
            setSubmitted("");
            draftId.current = null;
            completed = true;
          }
          if (item.done) break;
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!completed && !controller.signal.aborted)
        throw new Error(
          "Koneksi terputus sebelum jawaban diterima. Coba lagi.",
        );
    } catch (cause) {
      setDraft(value);
      setError(
        controller.signal.aborted
          ? "Permintaan dihentikan. Draf masih tersedia."
          : cause instanceof Error
            ? cause.message
            : "Jawaban belum dapat dimuat.",
      );
    } finally {
      stop.current = null;
      setPending("");
      setSubmitted("");
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      if (demo)
        sessionStorage.setItem(
          demoKey,
          JSON.stringify(demoThreads().filter((item) => item.id !== id)),
        );
      else if (!(await fetch(api + "?id=" + id, { method: "DELETE" })).ok)
        throw new Error();
      setItems((rows) => rows.filter((item) => item.id !== id));
      setThread(null);
      setDraft("");
      setRemoving(false);
      draftId.current = null;
      window.history.replaceState(null, "", threadHref());
      composer.current?.focus({ preventScroll: true });
    } catch {
      setError("Percakapan belum dapat dihapus. Coba lagi.");
    }
  }

  function newConversation() {
    if (pending) return;
    setThread(null);
    setDraft("");
    setError("");
    setRemoving(false);
    setMenuOpen(false);
    setShowLatest(false);
    pinned.current = true;
    draftId.current = null;
    window.history.replaceState(null, "", threadHref());
    composer.current?.focus({ preventScroll: true });
  }

  return (
    <section
      ref={page}
      className={
        "conversation-shell" +
        (!turns.length && !submitted ? " conversation-empty" : "")
      }
      aria-labelledby="assistant-title"
    >
      <header className="conversation-header">
        <div className="conversation-heading">
          <h1 id="assistant-title">Asisten</h1>
          <p>
            {demo ? "Data contoh" : "Data usaha"}
            {rangeLabel && (
              <>
                <span aria-hidden="true"> · </span>
                {rangeLabel}
              </>
            )}
          </p>
        </div>
        <div className="conversation-tools">
          <button
            type="button"
            className="conversation-icon"
            title="Riwayat percakapan"
            aria-label="Riwayat percakapan"
            onClick={() => historyDialog.current?.showModal()}
            disabled={!!pending}
          >
            <History size={20} />
          </button>
          <button
            type="button"
            className="conversation-new"
            aria-label="Percakapan baru"
            title="Percakapan baru"
            onClick={newConversation}
            disabled={!!pending}
          >
            <Plus size={18} />
            <span>Percakapan baru</span>
          </button>
          {thread && (
            <div className="conversation-menu">
              <button
                type="button"
                className="conversation-icon"
                aria-label="Opsi percakapan"
                aria-expanded={menuOpen}
                title="Opsi percakapan"
                disabled={!!pending}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MoreHorizontal size={21} />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    className="conversation-menu-dismiss"
                    aria-label="Tutup opsi"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="conversation-menu-list">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setRemoving(true);
                        deleteDialog.current?.showModal();
                      }}
                    >
                      <Trash2 size={16} />
                      Hapus percakapan
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        className="conversation-messages"
        ref={messagePane}
        onWheel={() => {
          userScrolled.current = true;
        }}
        onTouchMove={() => {
          userScrolled.current = true;
        }}
        onPointerDown={() => {
          userScrolled.current = true;
        }}
        onKeyDown={(event) => {
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "PageUp",
              "PageDown",
              "Home",
              "End",
              " ",
            ].includes(event.key)
          )
            userScrolled.current = true;
        }}
        onScroll={(event) => {
          if (!userScrolled.current) return;
          const element = event.currentTarget;
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            72;
          if (pinned.current) setShowLatest(false);
        }}
        tabIndex={turns.length || submitted ? 0 : undefined}
        role="region"
        aria-label="Pesan percakapan"
      >
        <div className="conversation-feed">
          {!turns.length && !submitted && (
            <div className="conversation-welcome">
              <span className="conversation-emblem" aria-hidden="true">
                <Sparkles size={26} strokeWidth={1.6} />
              </span>
              <h2>Mau bahas apa hari ini?</h2>
              <div className="conversation-starters">
                {starters.map((sample) => (
                  <button
                    type="button"
                    key={sample}
                    onClick={() => void send(sample)}
                  >
                    <MessageCircle size={17} aria-hidden="true" />
                    <span>{sample}</span>
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map(({ id, question, answer }) => (
            <div className="conversation-turn" id={"pesan-" + id} key={id}>
              <div className="conversation-user">
                <span className="sr-only">Anda: </span>
                <p>{question}</p>
              </div>
              <article
                className="conversation-response"
                aria-label="Jawaban Asisten"
              >
                <div className="conversation-author">
                  <Sparkles size={17} aria-hidden="true" />
                  <span>RAMU</span>
                </div>
                <div className="conversation-prose">
                  {answer.summary.split(/\n\s*\n/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
                {answer.advice &&
                  !answer.summary.includes(answer.advice) &&
                  answer.provider !== "gemini" && (
                    <p className="conversation-advice">{answer.advice}</p>
                  )}
                {answer.metrics.length > 0 && (
                  <details className="conversation-facts">
                    <summary>
                      Rincian angka <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <dl>
                      {answer.metrics.map(({ label, value }, index) => (
                        <div key={index}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
                <div className="conversation-evidence">
                  {answer.evidence && (
                    <Link href={answer.evidence} prefetch={false}>
                      <ExternalLink size={13} aria-hidden="true" />
                      Lihat bukti
                    </Link>
                  )}
                  {answer.next && (
                    <Link href={answer.next.href}>{answer.next.label}</Link>
                  )}
                  {answer.supportingEvidence
                    ?.filter((item) => item.href !== answer.evidence)
                    .map((item) => (
                      <Link key={item.href} href={item.href} prefetch={false}>
                        {item.label}
                      </Link>
                    ))}
                  {answer.provider === "gemini" && (
                    <span className="conversation-provider">
                      <Check size={12} aria-hidden="true" />
                      Gemini
                    </span>
                  )}
                </div>
                {answer.providerNotice && (
                  <p className="conversation-provider-notice">
                    {answer.providerNotice}
                  </p>
                )}
              </article>
            </div>
          ))}
          {submitted && (
            <div className="conversation-turn">
              <div className="conversation-user">
                <p>{submitted}</p>
              </div>
              <article className="conversation-response" aria-busy="true">
                <div className="conversation-author">
                  <Sparkles size={17} aria-hidden="true" />
                  <span>RAMU</span>
                </div>
                <p className="conversation-status" role="status">
                  <span aria-hidden="true" />
                  {pending}
                </p>
              </article>
            </div>
          )}
          <div ref={last} />
        </div>
      </div>

      <div className="conversation-bottom">
        {showLatest && (
          <button
            type="button"
            className="conversation-latest"
            onClick={latest}
          >
            <ArrowDown size={16} />
            Ke pesan terbaru
          </button>
        )}
        <div className="conversation-compose-wrap">
          {error && (
            <div className="conversation-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() =>
                  reload
                    ? window.location.reload()
                    : draft.trim()
                      ? void send()
                      : setError("")
                }
                disabled={!!pending}
              >
                {reload ? "Muat ulang" : draft.trim() ? "Coba lagi" : "Tutup"}
              </button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="conversation-composer"
            aria-busy={!!pending}
          >
            <label htmlFor="chat-question" className="sr-only">
              Pertanyaan untuk Asisten
            </label>
            <textarea
              ref={composer}
              id="chat-question"
              rows={1}
              maxLength={700}
              value={draft}
              readOnly={!!pending}
              placeholder="Tanyakan tentang usaha Anda"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            {pending ? (
              <button
                type="button"
                className="conversation-send"
                aria-label="Hentikan jawaban"
                title="Hentikan jawaban"
                onClick={() => stop.current?.abort()}
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="conversation-send"
                aria-label="Kirim pertanyaan"
                title="Kirim pertanyaan"
                disabled={!draft.trim()}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </form>
          <div className="conversation-footnote">
            <span>RAMU dapat keliru. Periksa data pendukung.</span>
            <details>
              <summary>Tentang {demo ? "demo" : "Asisten"}</summary>
              <p>
                {demo
                  ? "Demo memakai data contoh. Gunakan pertanyaan nonrahasia; percakapan dapat diproses Google untuk peningkatan layanan."
                  : limited
                    ? "Analisis dasar dihitung RAMU. Gemini gratis hanya tersedia pada demo data contoh."
                    : connection ||
                      "Angka dihitung RAMU dan penjelasan dapat dibantu Gemini."}{" "}
                <Link href="/privasi">Privasi</Link> ·{" "}
                <Link href="/ketentuan">Ketentuan</Link>
              </p>
            </details>
          </div>
        </div>
      </div>

      <dialog
        ref={historyDialog}
        className="conversation-history-dialog"
        aria-labelledby="conversation-history-title"
        onClick={(event) => {
          if (event.target === event.currentTarget)
            historyDialog.current?.close();
        }}
      >
        <div className="conversation-dialog-heading">
          <div>
            <h2 id="conversation-history-title">Percakapan</h2>
            <p>Lanjutkan diskusi sebelumnya.</p>
          </div>
          <button
            type="button"
            className="conversation-icon"
            aria-label="Tutup riwayat"
            onClick={() => historyDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <button
          type="button"
          className="conversation-history-new"
          onClick={() => {
            historyDialog.current?.close();
            newConversation();
          }}
        >
          <Plus size={18} />
          Percakapan baru
        </button>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={threadHref(item.id)}
                  aria-current={item.id === activeId ? "page" : undefined}
                  onClick={() => historyDialog.current?.close()}
                >
                  <MessageCircle size={17} aria-hidden="true" />
                  <span>{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="conversation-history-empty">
            Percakapan akan muncul setelah Anda mengirim pertanyaan.
          </p>
        )}
      </dialog>
      <dialog
        ref={deleteDialog}
        className="conversation-delete-dialog"
        aria-labelledby="conversation-delete-title"
        onClose={() => setRemoving(false)}
      >
        <h2 id="conversation-delete-title">Hapus percakapan ini?</h2>
        <p>Percakapan yang dihapus tidak dapat dikembalikan.</p>
        <div>
          <button
            type="button"
            className="conversation-cancel"
            onClick={() => deleteDialog.current?.close()}
          >
            Batal
          </button>
          <button
            type="button"
            className="conversation-delete"
            disabled={!removing || !!pending}
            onClick={() => {
              if (thread)
                void remove(thread.id).then(() =>
                  deleteDialog.current?.close(),
                );
            }}
          >
            Hapus percakapan
          </button>
        </div>
      </dialog>
    </section>
  );
}
