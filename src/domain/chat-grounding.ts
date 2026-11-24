import type { ChatAnswer, ChatContext } from "./chat-context.ts";

// Names stay in RAMU; only aliases and computed facts go to the provider.
export function chatPrivacy(names: readonly string[] = []) {
  const aliases = [...new Set(names.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((name, index) => ({ name, alias: `ITEM_${index + 1}` }));
  const substitutions = aliases.map(({ name, alias }) => ({
    pattern: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    alias,
  }));
  const scrub = (input: string, maxLength = 700) => {
    if (
      /^\s*[\[{]/.test(input) ||
      input.split(/\r?\n/).filter((line) => /[,;\t].*[,;\t]/.test(line))
        .length >= 2
    )
      return "[data mentah dihapus; ajukan pertanyaan analisis]";
    let text = input.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ");
    for (const { pattern, alias } of substitutions)
      text = text.replace(pattern, alias);
    return text
      .replace(/```[\s\S]*?(?:```|$)/g, "[lampiran dihapus]")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, "[tautan]")
      .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
      .replace(/(?:\+?62|0)[\d ()-]{8,20}\d/g, "[nomor]")
      .replace(
        /\b(?:AIza[\w-]{15,}|sk-[\w-]{10,}|eyJ[\w.-]{20,})\b/g,
        "[kredensial]",
      )
      .replace(
        /\b(?:rekening|nik|npwp|password|kata sandi|token|api[_ -]?key)\s*[:=]?\s*\S+/gi,
        "[data pribadi]",
      )
      .replace(/\b\d{9,}\b/g, "[identitas]")
      .slice(0, maxLength);
  };
  return { scrub, aliases };
}

export type ChatMemory = {
  question: string;
  answer?: string;
  intent?: ChatContext["intent"];
}[];

export function sensitiveChatInput(text: string) {
  return (
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?62|0)[\d ()-]{8,20}\d|\b(?:AIza[\w-]{15,}|sb_secret_[\w-]+|sk-[\w-]{10,}|eyJ[\w.-]{20,})\b|\b(?:rekening|nik|npwp|password|kata sandi|api[_ -]?key)\s*[:=]?\s*\S+|\bdata\s+(?:usaha\s+|bisnis\s+)?asli\b|^\s*[\[{]/im.test(
      text,
    ) ||
    text.split(/\r?\n/).filter((line) => /[,;\t].*[,;\t]/.test(line)).length >=
      2
  );
}

export function groundedChatInput(input: {
  question: string;
  answer: ChatAnswer;
  catalog: string[];
  memory?: ChatMemory;
  privateNames?: string[];
}) {
  const privacy = chatPrivacy([
    ...input.catalog,
    ...(input.privateNames ?? []),
  ]);
  const fact = (label: string, value: string, index: number) => {
    const entity =
      input.catalog.find((name) => label.includes(name)) ??
      input.answer.context.product ??
      "usaha";
    const metric = /rata-rata/i.test(label)
      ? "average-order"
      : /hpp/i.test(label)
        ? "cost-of-goods"
        : /laba bersih/i.test(label)
          ? "net-profit"
          : /laba/i.test(label)
            ? "gross-profit"
            : /perubahan|selisih/i.test(label)
              ? "change"
              : /pesanan/i.test(label)
                ? "orders"
                : /target/i.test(label)
                  ? "target"
                  : /pembanding/i.test(label)
                    ? "comparison"
                    : "sales";
    const direction =
      metric === "change" && /\d/.test(value)
        ? /[-−]|turun/i.test(value)
          ? "decrease"
          : /[1-9]/.test(value)
            ? "increase"
            : "equal"
        : undefined;
    return {
      id: `F${index + 1}`,
      metric,
      entity: privacy.scrub(entity),
      unit: /Rp/.test(value)
        ? "IDR"
        : /%/.test(value)
          ? "percent"
          : metric === "orders"
            ? "orders"
            : "text",
      period: input.answer.range ?? "periode terpilih",
      source: "perhitungan RAMU",
      direction,
      label: privacy.scrub(label),
      value,
      text: `${privacy.scrub(label)}: ${privacy.scrub(value)}`,
      restored: `${label}: ${value}`,
    };
  };
  const facts = input.answer.metrics
    .slice(0, 12)
    .map((metric, index) => fact(metric.label, metric.value, index));
  if (facts.length)
    for (const [label, value] of [
      ["Temuan", input.answer.title],
      ["Periode", input.answer.range],
    ])
      if (label && value) facts.push(fact(label, value, facts.length));
  const payload = {
    question: privacy.scrub(input.question),
    intent: input.answer.context.intent,
    focus: {
      ranking: input.answer.context.ranking,
      basis: "net-sales-value-not-unit-count",
      products: input.answer.context.products.map((name) =>
        privacy.scrub(name),
      ),
      selectedProduct: input.answer.context.product
        ? privacy.scrub(input.answer.context.product)
        : undefined,
    },
    memory: (input.memory ?? []).slice(-4).map((turn) => ({
      question: privacy.scrub(turn.question),
      answer: turn.answer ? privacy.scrub(turn.answer, 1800) : undefined,
      intent: turn.intent,
    })),
    period: input.answer.range,
    facts: facts.map(({ restored: _restored, ...data }) => {
      void _restored;
      return { ...data, value: privacy.scrub(data.value) };
    }),
    summary: privacy.scrub(input.answer.summary, 1800),
    limitations: privacy.scrub(input.answer.advice ?? ""),
    entities: privacy.aliases
      .filter(({ name }) => input.catalog.includes(name))
      .slice(0, 40)
      .map(({ alias }) => alias),
  };
  return { payload, facts, privacy };
}

export function renderGroundedChat(
  value: unknown,
  input: ReturnType<typeof groundedChatInput>,
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as { paragraphs?: unknown; claims?: unknown };
  if (
    !Object.keys(parsed).every((key) =>
      ["paragraphs", "claims"].includes(key),
    ) ||
    !Array.isArray(parsed.paragraphs) ||
    parsed.paragraphs.length < 1 ||
    parsed.paragraphs.length > 4
  )
    return null;
  const lookup = new Map(input.facts.map((fact) => [fact.id, fact]));
  const claims = new Map<string, string>();
  if (parsed.claims !== undefined) {
    if (!Array.isArray(parsed.claims) || parsed.claims.length > 16) return null;
    for (const claim of parsed.claims) {
      if (
        !claim ||
        typeof claim !== "object" ||
        Object.keys(claim).some(
          (key) => !["id", "metric", "entity", "direction"].includes(key),
        )
      )
        return null;
      const fact = lookup.get(claim.id);
      if (
        !fact ||
        fact.metric !== claim.metric ||
        fact.entity !== claim.entity ||
        !["value", "increase", "decrease", "equal"].includes(claim.direction) ||
        (claim.direction !== "value" && fact.direction !== claim.direction)
      )
        return null;
      claims.set(claim.id, claim.direction);
    }
  }
  const names = new Map(
    input.privacy.aliases.map(({ alias, name }) => [alias, name]),
  );
  const result: string[] = [];
  for (const item of parsed.paragraphs) {
    if (typeof item !== "string" || item.length > 1600 || !item.trim())
      return null;
    let invalid = false;
    const prose = item
      .replace(
        /\{\{(F\d+)(?:\.(value|label))?\}\}/g,
        (_token, id: string, field?: string) => {
          if (!lookup.has(id) || (field && !claims.has(id))) invalid = true;
          return "";
        },
      )
      .replace(/\bITEM_\d+\b/g, (alias) => {
        if (!names.has(alias)) invalid = true;
        return "";
      });
    if (
      invalid ||
      /[\p{N}{}<>]|https?:|www\.|\b(?:juta|miliar|ribu|seratus|seribu|setengah|puluh|ratus)\b/iu.test(
        prose,
      ) ||
      input.privacy.scrub(prose, 1600).trim() !== prose.trim()
    )
      return null;
    // Keep ordinary advice ("satu langkah") while refusing invented counts
    // written in words. Concepts may use explicitly hypothetical examples.
    if (
      input.payload.intent !== "concept" &&
      /\b(?:nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas)\s+(?:pesanan|transaksi|unit|produk|pelanggan|rupiah|persen|hari\s+jual)\b/i.test(
        prose,
      )
    )
      return null;
    const directions = [
      ...item.matchAll(/\{\{(F\d+)(?:\.(?:value|label))?\}\}/g),
    ].map((match) => claims.get(match[1]) ?? lookup.get(match[1])?.direction);
    if (
      directions.length &&
      ((/\b(turun|menurun|penurunan)\b/i.test(prose) &&
        !directions.includes("decrease")) ||
        (/\b(naik|meningkat|kenaikan)\b/i.test(prose) &&
          !directions.includes("increase")))
    )
      return null;
    if (/\b(pasti|terbukti)\b.*\b(karena|disebabkan)\b/i.test(prose))
      return null;
    result.push(
      item
        .replace(
          /\{\{(F\d+)(?:\.(value|label))?\}\}/g,
          (_token, id: string, field?: string) =>
            field
              ? lookup.get(id)![field as "value" | "label"]
              : lookup.get(id)!.restored,
        )
        .replace(/\bITEM_\d+\b/g, (alias) => names.get(alias)!)
        .trim(),
    );
  }
  if (
    input.facts.length &&
    !parsed.paragraphs.some((line) =>
      /\{\{F\d+(?:\.(?:value|label))?\}\}/.test(String(line)),
    )
  )
    return null;
  return result.join("\n\n");
}
