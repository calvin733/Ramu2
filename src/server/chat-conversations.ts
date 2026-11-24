import type { ChatTurn } from "@/domain/chat-context";
import { supabaseRequest } from "./supabase-http";

export type Conversation = {
  id: string;
  title: string;
  turns: ChatTurn[];
  version: number;
};
export type ConversationScope = { businessId: string; token: string };

function scopedPath(scope: ConversationScope, query: Record<string, string>) {
  return (
    "/rest/v1/business_conversations?" +
    new URLSearchParams({ business_id: "eq." + scope.businessId, ...query })
  );
}

export async function conversationList(scope: ConversationScope) {
  const response = await supabaseRequest(
    scopedPath(scope, {
      select: "id,title",
      order: "updated_at.desc",
      limit: "30",
    }),
    { token: scope.token },
  );
  if (!response.ok) throw new Error("Riwayat percakapan belum dapat dibuka.");
  return (await response.json()) as Pick<Conversation, "id" | "title">[];
}

export async function readConversation(scope: ConversationScope, id: string) {
  const response = await supabaseRequest(
    scopedPath(scope, { id: "eq." + id, select: "id,title,turns,version" }),
    { token: scope.token },
  );
  if (!response.ok) throw new Error("Percakapan belum dapat dibuka.");
  const [item] = (await response.json()) as Conversation[];
  return item ?? null;
}

export async function appendTurn(
  scope: ConversationScope,
  id: string,
  previous: Conversation | null,
  turn: ChatTurn,
) {
  const turns = [...(previous?.turns ?? []), turn];
  const record = {
    turns,
    title: previous?.title ?? Array.from(turn.question).slice(0, 100).join(""),
    version: (previous?.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  const response = await supabaseRequest(
    previous
      ? scopedPath(scope, { id: "eq." + id, version: "eq." + previous.version })
      : "/rest/v1/business_conversations",
    {
      method: previous ? "PATCH" : "POST",
      admin: true,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(
        previous ? record : { ...record, id, business_id: scope.businessId },
      ),
    },
  );
  if (response.status === 409) return null;
  if (!response.ok) throw new Error("Jawaban belum dapat disimpan.");
  const [saved] = (await response.json()) as Conversation[];
  return saved ?? null;
}

export async function deleteConversation(scope: ConversationScope, id: string) {
  const response = await supabaseRequest(
    scopedPath(scope, { id: "eq." + id }),
    { method: "DELETE", admin: true },
  );
  if (!response.ok) throw new Error("Percakapan belum dapat dihapus.");
}
