import { classifyQuestion, mentionedProducts } from "./assistant.ts";
import {
  rangeForPeriod,
  type DateRange,
  type Period,
  type SearchParams,
} from "./sales.ts";
import { targetDate } from "./target-input.ts";

export const chatIntents = [
  "sales",
  "orders",
  "average",
  "products",
  "growth",
  "decline",
  "peak",
  "compare",
  "profit",
  "gross",
  "target",
  "overview",
  "advice",
  "greeting",
  "thanks",
  "concept",
  "unsupported",
] as const;
export type ChatIntent = (typeof chatIntents)[number];
export type ChatSelection = {
  period: Period;
  range?: DateRange;
  comparison?: DateRange;
  invalidRange?: boolean;
};
export type ChatContext = ChatSelection & {
  intent: ChatIntent;
  products: string[];
  product?: string;
  topic?: string;
  ranking?: "lowest" | "highest";
};
export type ChatAnswer = {
  title: string;
  summary: string;
  metrics: { label: string; value: string }[];
  context: ChatContext;
  evidence?: string;
  source?: string;
  range?: string;
  advice?: string;
  next?: { href: string; label: string };
  suggestions: string[];
  provider?: "gemini" | "basic" | "limited";
  providerNotice?: string;
  analysisSummary?: string;
  supportingEvidence?: { href: string; label: string }[];
};
export type ChatTurn = {
  id: string;
  question: string;
  answer: ChatAnswer;
  demoReceipt?: string;
};

const day = 86_400_000;
export const dayShift = (date: string, days: number) =>
  new Date(Date.parse(date) + day * days).toISOString().slice(0, 10);
const months =
  "januari februari maret april mei juni juli agustus september oktober november desember".split(
    " ",
  );

function validRange(start: unknown, end: unknown): DateRange | undefined {
  if (
    typeof start !== "string" ||
    typeof end !== "string" ||
    targetDate(start) !== start ||
    targetDate(end) !== end ||
    Date.parse(end) - Date.parse(start) > 366 * day ||
    start > end
  )
    return undefined;
  return { start, end };
}

export function chatRanges(params: SearchParams) {
  return {
    range: validRange(params.awal, params.akhir),
    comparison: validRange(params.bandingAwal, params.bandingAkhir),
  };
}

export function dateSelection(
  text: string,
  base: ChatSelection,
  today: string,
): ChatSelection {
  text = text.toLowerCase().replace(/\bbulan sebelumnya\b/g, "bulan lalu");
  const dates = [
    ...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g),
  ].map(([value]) => targetDate(value));
  if (dates.length) {
    const [start, end = start, priorStart, priorEnd = priorStart] = dates;
    const range = validRange(start, end);
    const comparison = validRange(priorStart, priorEnd);
    return range && (dates.length < 3 || comparison) && dates.length <= 4
      ? {
          period: base.period,
          range,
          comparison,
        }
      : { ...base, invalidRange: true };
  }
  const expressions = [
    ...text.matchAll(
      /\bbulan (ini|lalu|kemarin)\b|\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)(?:\s+((?:19|20|21)\d{2}))?\b/g,
    ),
  ];
  const periods: Period[] = expressions.map(
    ([, relative, named, explicitYear]) => {
      const anchor = new Date(today + "T00:00:00Z");
      if (relative && relative !== "ini") {
        anchor.setUTCDate(1);
        anchor.setUTCMonth(anchor.getUTCMonth() - 1);
      }
      return {
        kind: "month",
        year: explicitYear ? Number(explicitYear) : anchor.getUTCFullYear(),
        month: named ? months.indexOf(named) + 1 : anchor.getUTCMonth() + 1,
      };
    },
  );
  if (periods.length > 1)
    return {
      period: periods[0],
      range: rangeForPeriod(periods[0]),
      comparison: rangeForPeriod(periods[1]),
    };
  if (
    periods[0] &&
    /\b(banding|bandingkan|dibanding)\b/.test(text) &&
    /bulan (lalu|kemarin)/.test(text) &&
    !base.range
  )
    return { period: base.period };
  if (periods[0]) return { period: periods[0] };
  const recent = /\b(\d{1,3})\s+hari\s+(?:terakhir|belakangan)\b/.exec(text);
  if (recent) {
    const count = Number(recent[1]);
    if (count < 1 || count > 366) return { ...base, invalidRange: true };
    const start = dayShift(today, 1 - count);
    return {
      period: base.period,
      range: { start, end: today },
      comparison: { start: dayShift(start, -count), end: dayShift(start, -1) },
    };
  }
  if (/\b(hari ini|kemarin)\b/.test(text) && !/\b(bulan|minggu)\b/.test(text)) {
    const selected = dayShift(today, /\bkemarin\b/.test(text) ? -1 : 0);
    return {
      period: base.period,
      range: { start: selected, end: selected },
      comparison: {
        start: dayShift(selected, -1),
        end: dayShift(selected, -1),
      },
    };
  }
  if (/\bminggu (lalu|kemarin|ini)\b/.test(text)) {
    const weekday = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
    const offset = weekday + (/minggu ini/.test(text) ? 0 : 7);
    const start = dayShift(today, -offset);
    const end = dayShift(start, /minggu ini/.test(text) ? weekday : 6);
    return {
      period: base.period,
      range: { start, end },
      comparison: { start: dayShift(start, -7), end: dayShift(end, -7) },
    };
  }
  const match = /\btahun\s+((?:19|20|21)\d{2})\b/.exec(text);
  if (match) return { period: { kind: "year", year: Number(match[1]) } };
  const { period, range, comparison } = base;
  return { period, range, comparison };
}

export function interpretChat(
  text: string,
  previous: ChatContext | undefined,
  catalog: string[],
  inferred?: ChatIntent,
): {
  intent: ChatIntent;
  product?: string;
  pair: string[];
  limit: number;
  sellingDays: number | null;
  missingStock: boolean;
  missingCash: boolean;
  unresolvedReference?: boolean;
  ranking?: "lowest" | "highest";
  includeAdvice: boolean;
  unsupportedUnits: boolean;
} {
  const words = text
    .toLocaleLowerCase("id")
    .replace(
      /\b(penjualan|omzet|omset|pendapatan|pesanan|transaksi|produk|barang|target|laba|untung)(?:nya|ku|mu)\b/g,
      "$1",
    );
  const knownNames = mentionedProducts(text, catalog);
  const ordinals = [
    "pertama",
    "kedua",
    "ketiga",
    "keempat",
    "kelima",
    "keenam",
    "ketujuh",
    "kedelapan",
    "kesembilan",
    "kesepuluh",
  ];
  const position =
    /\b(?:yang|produk)\s+(pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|kesembilan|kesepuluh|10|[1-9])\b/.exec(
      words,
    )?.[1];
  const index = position
    ? ordinals.includes(position)
      ? ordinals.indexOf(position)
      : Number(position) - 1
    : -1;
  const globalProducts =
    /\b(?:semua|seluruh|total)\b|\bproduk\s+(?:apa|mana|yang)\b|\b(?:tampilkan|lihat|daftar)\b.*\bproduk\b|\b(?:\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+produk\b/.test(
      words,
    );
  const product =
    knownNames[0] ??
    previous?.products[index] ??
    (!globalProducts && !position ? previous?.product : undefined);
  const basic = classifyQuestion(text);
  const includeAdvice =
    /\b(saran|rekomendasi|strategi\w*|fokus|sebaiknya|langkah|tips|rencana|prioritas)\b/.test(
      words,
    );
  const lowRanking =
    /\b(paling\s+(?:tidak|kurang)\s+(?:laris|laku)|(?:tidak|kurang)\s+(?:laris|laku)|terendah|tersedikit|terlemah|tersepi|paling\s+(?:sedikit|rendah|sepi|lemah)|jarang\s+(?:laku|dibeli|terjual)|slow\s*(?:moving|seller)|least\s+(?:popular|selling)|worst\s+seller)\b/.test(
      words,
    );
  const highRanking =
    /\b(terlaris|paling\s+(?:laris|laku|tinggi|banyak)|tertinggi|terbanyak|best\s*seller)\b/.test(
      words,
    );
  const ranking = lowRanking ? "lowest" : highRanking ? "highest" : undefined;
  const productQuestion = /\b(produk|barang|item|menu|varian)\b/.test(words);
  const productAdvice =
    includeAdvice &&
    (knownNames.length > 0 || !!position || previous?.intent === "products") &&
    !/\b(usaha|bisnis|keseluruhan|semua)\b/.test(words);
  let intent: ChatIntent = "unsupported";
  if (
    /\b(apa (?:itu|beda|bedanya)|pengertian|definisi|jelaskan arti|maksud istilah)\b/.test(
      words,
    ) &&
    /\b(omzet|omset|laba|hpp|margin|aov|pesanan|kas|stok|target)\b/.test(words)
  )
    intent = "concept";
  else if (/\b(target|realistis|dikejar|hari jual)\b/.test(words))
    intent = "target";
  else if (
    (ranking && (productQuestion || previous?.intent === "products")) ||
    productAdvice
  )
    intent = "products";
  else if (
    /\b(saran|rekomendasi|strategi|fokus|sebaiknya|langkah|tips|rencana|prioritas)\b|\b(?:biar|agar)\b.*\b(?:naik|meningkat|laku|untung|bagus)\b/.test(
      words,
    )
  )
    intent = "advice";
  else if (/\b(laba kotor|gross profit|hpp)\b/.test(words)) intent = "gross";
  else if (
    basic === "profit" ||
    /\b(laba|untung|cuan|margin|profit)\b/.test(words)
  )
    intent = "profit";
  else if (/\b(rata.rata|aov)\b/.test(words)) intent = "average";
  else if (/\b(bandingkan|vs|versus|keduanya)\b/.test(words))
    intent =
      knownNames.length || position || /\b(produk|keduanya)\b/.test(words)
        ? "compare"
        : (previous?.intent ?? "sales");
  else if (basic === "peak" || /\b(paling ramai|hari tersibuk)\b/.test(words))
    intent = "peak";
  else if (
    basic === "decline" ||
    (/\b(turun|anjlok|menurun)\b/.test(words) && (position || product))
  )
    intent = "decline";
  else if (
    basic === "growth" ||
    /\b(pendorong|berpengaruh|kontribusi)\b/.test(words)
  )
    intent = "growth";
  else if (
    /\b(produk|barang|terlaris|best seller)\b/.test(words) ||
    !!position ||
    knownNames.length ||
    (product &&
      /\b(penjualan|omzet|omset|pendapatan|gimana|bagaimana|jelaskan|dijelaskan)\b/.test(
        words,
      ))
  )
    intent = "products";
  else if (/\b(order|orders|pesanan|transaksi)\b/.test(words))
    intent = "orders";
  else if (
    /\b(penjualan|omzet|omset|pendapatan|tren|revenue|jualan|dana cair|pencairan)\b/.test(
      words,
    )
  )
    intent = "sales";
  else if (
    previous &&
    /\b(kenapa|mengapa|sederhana|simpel|bulan|minggu|tahun|kalau|jelaskan|dijelaskan|lanjut|gimana|bagaimana|maksudnya|itu|tadi|lagi|terus)\b/.test(
      words,
    )
  )
    intent = previous.intent;
  else if (
    /^(?:halo|hai|hei|hi|hello|pagi|siang|sore|malam|apa kabar|selamat (?:pagi|siang|sore|malam))(?:\s+ramu)?[!?.\s]*$/i.test(
      words.trim(),
    )
  )
    intent = "greeting";
  else if (
    /^(?:makasih|terima kasih|thanks|thank you|oke|ok|sip|baik)(?:\s+(?:ya|ramu))?[!?.\s]*$/i.test(
      words.trim(),
    )
  )
    intent = "thanks";
  else if (
    /\b(kondisi|ringkasan|kabar|gimana|bagaimana|evaluasi|usahaku|bisnisku|usaha saya|bisnis saya)\b/.test(
      words,
    )
  )
    intent = "overview";
  else if (inferred) intent = inferred;

  const pair = [
    ...new Set(
      [
        ...knownNames,
        ...(position ? [previous?.product, previous?.products[index]] : []),
        ...(/\bkeduanya\b/.test(words) ||
        (intent === "compare" &&
          previous?.intent === "compare" &&
          !position &&
          !knownNames.length)
          ? (previous?.products.slice(0, 2) ?? [])
          : []),
      ].filter((name): name is string => !!name),
    ),
  ];
  const sellingDays = /\b(\d{1,3})\s+hari jual\b/.exec(words)?.[1];
  const top =
    /\b(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+produk\b/.exec(
      words,
    )?.[1];
  const wordsToCount = [
    "satu",
    "dua",
    "tiga",
    "empat",
    "lima",
    "enam",
    "tujuh",
    "delapan",
    "sembilan",
    "sepuluh",
  ];
  const limit = top
    ? Math.min(10, Math.max(1, Number(top) || wordsToCount.indexOf(top) + 1))
    : ranking && /\bpaling\b|\bterlaris\b/.test(words)
      ? 1
      : 3;
  return {
    intent,
    product:
      ranking && !knownNames.length && !position
        ? undefined
        : productAdvice && !product
          ? previous?.products[0]
          : product,
    unresolvedReference:
      !!position && !knownNames.length && !previous?.products[index],
    pair,
    limit,
    sellingDays: sellingDays === undefined ? null : Number(sellingDays),
    missingStock: /\b(stok|persediaan|inventori)\b/.test(words),
    missingCash: /\b(saldo|arus kas|uang masuk)\b/.test(words),
    ranking:
      ranking ??
      (intent === "products" && !globalProducts
        ? previous?.ranking
        : undefined),
    includeAdvice,
    unsupportedUnits:
      /\b(unit|pcs|buah|kuantitas)\b|jumlah\s+(?:barang|produk)\s+(?:terjual|dibeli)/.test(
        words,
      ),
  };
}
