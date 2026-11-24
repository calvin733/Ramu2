import { formatNumber, rupiah } from "./sales.ts";
import { productMovements, type SalesReport } from "./sales-report.ts";

export const assistantQuestions = {
  growth: "Apa pendorong kenaikan penjualan?",
  decline: "Produk apa yang menurun?",
  peak: "Hari apa paling ramai?",
  compare: "Bandingkan produk",
} as const;

export type Intent = keyof typeof assistantQuestions;
export type AssistantIntent = Intent | "profit" | "unsupported";

export function readIntent(value: unknown): AssistantIntent | null {
  switch (value) {
    case "growth":
    case "decline":
    case "peak":
    case "compare":
    case "profit":
    case "unsupported":
      return value;
    default:
      return null;
  }
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase("id")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function classifyQuestion(question: string): AssistantIntent {
  const words = normalize(question);
  if (/\b(laba|untung|keuntungan|profit|margin|hpp|biaya|modal)\b/.test(words))
    return "profit";
  if (
    /\b(bandingkan|banding|perbandingan|membandingkan|vs|versus)\b/.test(words)
  )
    return "compare";
  if (
    /\b(hari|kapan|tanggal)\b/.test(words) &&
    /\b(ramai|tersibuk|terbanyak|paling banyak|pesanan tertinggi)\b/.test(words)
  )
    return "peak";
  if (
    /\b(produk|barang|item)\b/.test(words) &&
    /\b(turun|menurun|penurunan|melemah)\b/.test(words)
  )
    return "decline";
  if (
    /\b(penjualan|omzet|pendapatan)\b/.test(words) &&
    /\b(naik|kenaikan|meningkat|peningkatan|pendorong|pertumbuhan)\b/.test(
      words,
    )
  )
    return "growth";
  return "unsupported";
}

export function mentionedProducts(question: string, names: string[]) {
  const text = " " + normalize(question) + " ";
  const matches = names.flatMap((name) => {
    const normalized = normalize(name);
    const index = normalized ? text.indexOf(" " + normalized + " ") : -1;
    return index === -1 ? [] : [{ name, index, length: normalized.length }];
  });
  return matches
    .filter(
      (match) =>
        !matches.some(
          (other) =>
            other.length > match.length &&
            other.index <= match.index &&
            other.index + other.length >= match.index + match.length,
        ),
    )
    .sort((a, b) => a.index - b.index)
    .map(({ name }) => name);
}

type Product = NonNullable<SalesReport["products"]>[number];
type Evidence =
  { kind: "time"; date?: string } | { kind: "product"; names: string[] };
type Metric = { label: string; value: string };

export type AssistantAnswer = {
  title: string;
  summary: string;
  metrics?: Metric[];
  evidence?: Evidence;
  suggestion?: string;
  recovery?: "source" | "period" | "products";
  compared?: boolean;
};

const money = (product: Product): Metric => ({
  label: product.name,
  value: rupiah(product.revenue),
});

function change(value: number | bigint) {
  if (value === 0 || value === 0n) return "Tetap";
  return (value > 0 ? "Naik " : "Turun ") + rupiah(value < 0 ? -value : value);
}

export function assistantAnswer(
  intent: AssistantIntent,
  report: SalesReport | null,
  names: string[] = [],
): AssistantAnswer {
  if (intent === "unsupported")
    return {
      title: "Coba salah satu pertanyaan di bawah",
      summary:
        "Asisten dapat menjawab empat jenis pertanyaan tentang penjualan, produk, dan pesanan.",
    };
  if (intent === "profit")
    return {
      title: "Laba memerlukan data biaya",
      summary:
        "Laba kotor memerlukan harga pokok penjualan (HPP). Untuk menghitung laba bersih, biaya operasional dan biaya lain juga perlu dicatat.",
      suggestion:
        "Siapkan catatan biaya untuk periode yang sama dengan data penjualan.",
      recovery: "source",
    };
  if (!report)
    return {
      title: "Data penjualan belum tersedia untuk periode ini",
      summary:
        "Pilih periode dengan cakupan penjualan atau periksa sumber data Anda.",
      recovery: "period",
    };

  const products = report.products;
  if (intent === "peak") {
    if (report.totals.orders === null)
      return {
        title: "Jumlah pesanan belum bisa dihitung",
        summary:
          "Asisten memerlukan ID pesanan pada setiap transaksi selesai untuk menghitung pesanan unik per hari.",
        recovery: "source",
      };
    const highest = report.calendar.reduce(
      (best, day) => Math.max(best, day.orders ?? 0),
      0,
    );
    const days = report.calendar.filter(({ orders }) => orders === highest);
    const first = days[0];
    return highest > 0 && first
      ? {
          title:
            days.length === 1
              ? first.fullLabel + " paling ramai"
              : formatNumber(days.length) +
                " hari memiliki jumlah pesanan tertinggi",
          summary:
            days.length === 1
              ? "Hari ini mencatat jumlah pesanan unik tertinggi dalam periode terpilih."
              : "Jumlah pesanan tertinggi tercatat pertama kali pada " +
                first.fullLabel +
                ".",
          metrics: [
            {
              label: "Pesanan pada setiap hari puncak",
              value: formatNumber(highest),
            },
          ],
          evidence: { kind: "time", date: first.date },
          suggestion:
            "Periksa catatan operasional pada hari tersebut untuk memahami kenaikan pesanan.",
        }
      : {
          title: "Belum ada pesanan selesai",
          summary: "Jumlah pesanan tercatat adalah 0 pada periode ini.",
          evidence: { kind: "time" },
        };
  }

  if (intent === "compare") {
    if (products === null)
      return {
        title: "Rincian produk belum lengkap",
        summary:
          "Periksa kolom nama produk dan nilai penjualan per item pada sumber data.",
        recovery: "source",
      };
    if (products.length < 2)
      return {
        title: "Perbandingan memerlukan dua produk",
        summary:
          "Pilih periode yang memiliki setidaknya dua produk dalam rincian penjualan.",
        recovery: "period",
      };
    const first = products.find(({ name }) => name === names[0]);
    const second = products.find(({ name }) => name === names[1]);
    if (!first || !second || first === second)
      return {
        title: "Produk mana yang ingin dibandingkan?",
        summary: names.length
          ? "Pilih dua produk berbeda dari daftar di bawah."
          : "Pilih dua produk untuk membandingkan penjualan bersih pada periode terpilih.",
        recovery: "products",
      };
    const difference = BigInt(first.revenue) - BigInt(second.revenue);
    return {
      title: "Perbandingan penjualan produk",
      summary:
        difference === 0n
          ? "Kedua produk memiliki penjualan bersih yang sama."
          : (difference > 0n ? first.name : second.name) +
            " memiliki penjualan bersih lebih tinggi pada periode ini.",
      metrics: [
        money(first),
        money(second),
        {
          label: "Selisih",
          value: rupiah(difference < 0n ? -difference : difference),
        },
      ],
      evidence: { kind: "product", names: [first.name, second.name] },
      suggestion:
        "Periksa harga dan jumlah unit terjual untuk memahami selisih penjualan.",
      compared: true,
    };
  }

  if (!report.comparison)
    return {
      title: "Periode pembanding belum tersedia",
      summary:
        "Pilih periode dengan cakupan pembanding yang setara untuk melihat perubahan.",
      metrics: [
        {
          label: "Penjualan periode ini",
          value: rupiah(report.totals.revenue),
        },
      ],
      evidence: { kind: "time" },
      recovery: "period",
    };

  const difference =
    BigInt(report.totals.revenue) - BigInt(report.comparison.totals.revenue);
  const totals = [
    { label: "Penjualan periode ini", value: rupiah(report.totals.revenue) },
    {
      label: "Penjualan pembanding",
      value: rupiah(report.comparison.totals.revenue),
    },
    { label: "Perubahan", value: change(difference) },
  ];
  const { increase, decrease } = productMovements(report);

  if (intent === "growth" && difference <= 0n)
    return {
      title: "Penjualan tidak naik",
      summary:
        "Total penjualan bersih " +
        (difference === 0n ? "tetap." : "turun dibanding periode pembanding."),
      metrics: totals,
      evidence: { kind: "time" },
    };

  if (!products || !report.productComparison)
    return {
      title: "Perubahan per produk belum bisa dihitung",
      summary:
        "Nama produk dan penjualan per item harus tersedia pada kedua periode.",
      metrics: intent === "growth" ? totals : undefined,
      evidence: intent === "growth" ? { kind: "time" } : undefined,
      recovery: "source",
    };

  if (intent === "growth")
    return increase
      ? {
          title: increase.name + " mencatat kenaikan terbesar",
          summary:
            "Total penjualan bersih naik " +
            rupiah(difference) +
            " dibanding periode pembanding.",
          metrics: [
            { label: "Penjualan produk ini", value: rupiah(increase.revenue) },
            {
              label: "Penjualan pembanding",
              value: rupiah(increase.previous ?? 0),
            },
            {
              label: "Perubahan produk",
              value: change(increase.movement ?? 0),
            },
          ],
          evidence: { kind: "product", names: [increase.name] },
          suggestion:
            "Periksa perubahan harga, promosi, dan unit terjual pada produk ini.",
        }
      : {
          title: "Total penjualan naik",
          summary:
            "Tidak ada produk dengan kenaikan yang tercatat dalam rincian.",
          metrics: totals,
          evidence: { kind: "time" },
        };

  return decrease
    ? {
        title: decrease.name + " mencatat penurunan terbesar",
        summary:
          "Dari produk yang turun, penjualan bersih produk ini berkurang paling banyak.",
        metrics: [
          { label: "Penjualan periode ini", value: rupiah(decrease.revenue) },
          {
            label: "Penjualan pembanding",
            value: rupiah(decrease.previous ?? 0),
          },
          { label: "Perubahan", value: change(decrease.movement ?? 0) },
        ],
        evidence: { kind: "product", names: [decrease.name] },
        suggestion: "Periksa ketersediaan stok dan perubahan harga produk ini.",
      }
    : products.length
      ? {
          title: "Tidak ada penurunan penjualan per produk",
          summary:
            "Penjualan setiap produk tetap atau naik dibanding periode pembanding.",
          evidence: { kind: "product", names: [] },
        }
      : {
          title: "Belum ada produk tercatat",
          summary: "Pilih periode yang berisi rincian penjualan produk.",
          recovery: "period",
        };
}
