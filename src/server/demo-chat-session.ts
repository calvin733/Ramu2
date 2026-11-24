import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChatTurn } from "../domain/chat-context.ts";

const fallbackKey = randomBytes(32).toString("hex");
const key = () =>
  process.env.SUPABASE_SECRET_KEY || process.env.GEMINI_API_KEY || fallbackKey;
const mac = (value: string) =>
  createHmac("sha256", key())
    .update("ramu-demo-chat-v1:" + value)
    .digest("base64url");
function validMac(value: string, signature: string) {
  const expected = Buffer.from(mac(value));
  const supplied = Buffer.from(signature);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function demoChatSession(request: Request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ramu-demo-chat="))
    ?.slice("ramu-demo-chat=".length);
  const [id, signature] = raw?.split(".") ?? [];
  if (id && /^[a-f0-9]{32}$/.test(id) && signature && validMac(id, signature))
    return { id, cookie: undefined };
  const next = randomBytes(16).toString("hex");
  return {
    id: next,
    cookie: `ramu-demo-chat=${next}.${mac(next)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}

export function demoTurnReceipt(
  session: string,
  thread: string,
  turn: ChatTurn,
  version: number,
) {
  const { demoReceipt: _old, ...clean } = turn;
  void _old;
  const payload = Buffer.from(
    JSON.stringify({
      session,
      thread,
      version,
      expires: Date.now() + 7_200_000,
      turn: clean,
    }),
  ).toString("base64url");
  return payload + "." + mac(payload);
}

export function verifiedDemoHistory(
  session: string,
  thread: string,
  value: unknown,
) {
  if (value === undefined) return { turns: [] as ChatTurn[], version: 0 };
  if (!Array.isArray(value) || value.length > 4) return null;
  const turns: ChatTurn[] = [];
  let version = 0;
  for (const receipt of value) {
    if (typeof receipt !== "string" || receipt.length > 30_000) return null;
    const [payload, signature, extra] = receipt.split(".");
    if (!payload || !signature || extra || !validMac(payload, signature))
      return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (
        parsed.session !== session ||
        parsed.thread !== thread ||
        parsed.expires < Date.now() ||
        !Number.isInteger(parsed.version) ||
        parsed.version <= version ||
        parsed.version > 24 ||
        !parsed.turn?.answer?.context ||
        typeof parsed.turn.question !== "string"
      )
        return null;
      turns.push({ ...parsed.turn, demoReceipt: receipt });
      version = parsed.version;
    } catch {
      return null;
    }
  }
  return { turns, version };
}
