import { assistantAnswer, type Intent } from "./assistant.ts";
import {
  interpretChat,
  type ChatAnswer,
  type ChatContext,
  type ChatIntent,
  type ChatSelection,
} from "./chat-context.ts";
import { calculateProfit, periodCost, type PeriodCost } from "./profit.ts";
import {
  formatNumber,
  formatRange,
  percentageChange,
  rupiah,
} from "./sales.ts";
import type { SalesReport } from "./sales-report.ts";
import type { Target, TargetProgress } from "./targets.ts";

const suggestions = [
  "Bagaimana penjualan bulan ini?",
  "Tampilkan tiga produk",
  "Target omzet saya realistis?",
];
const percentage = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function analyzeChat(input: {
  question: string;
  selection: ChatSelection;
  report: SalesReport | null;
  previous?: ChatContext;
  costs?: readonly PeriodCost[];
  inferred?: ChatIntent;
  request?: ReturnType<typeof interpretChat>;
  targetProgress?: (
    sellingDays: number | null,
  ) => { target: Target; progress: TargetProgress } | undefined;
  source?: string;
  sourceHref: string;
  evidenceHref: (kind: "product" | "time", date?: string) => string;
}): ChatAnswer {
  const { report, question, sourceHref, previous } = input;
  const catalog = report?.products?.map(({ name }) => name) ?? [];
  const request =
    input.request ?? interpretChat(question, previous, catalog, input.inferred);
  const { intent, product, pair, sellingDays } = request;
  const context: ChatContext = {
    ...input.selection,
    intent,
    products: previous?.products ?? [],
    product,
    ranking: request.ranking,
  };
  const answer: ChatAnswer = {
    title: "Data penjualan belum tersedia",
    summary: "Pilih periode yang tercakup atau periksa sumber penjualan Anda.",
    metrics: [],
    context,
    suggestions,
    source: input.source,
    range: report ? formatRange(report.active, true) : undefined,
  };
  const finish = () => {
    const gap = [
      request.missingStock
        ? "Stok memerlukan saldo awal serta pergerakan barang."
        : "",
      request.missingCash
        ? "Arus kas memerlukan catatan uang masuk, uang keluar, dan saldo awal."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (gap) {
      answer.advice = [answer.advice, gap].filter(Boolean).join(" ");
      answer.next ??= { href: sourceHref, label: "Lihat kebutuhan data" };
    }
    if (report?.incomplete)
      answer.summary += " Cakupan penjualan untuk periode ini masih parsial.";
    return answer;
  };
  if (intent === "greeting" || intent === "thanks") {
    answer.title = intent === "greeting" ? "Halo, saya RAMU" : "Sama-sama";
    answer.summary =
      intent === "greeting"
        ? "Mau cek kondisi usaha, bahas produk, atau lihat target yang ingin dikejar? Ceritakan saja apa yang ingin Anda pahami."
        : "Senang bisa membantu. Kalau ada angka atau rencana usaha yang ingin dibahas lagi, lanjutkan saja di sini.";
    answer.context = previous ?? context;
    return answer;
  }
  if (intent === "concept") {
    const words = question.toLowerCase();
    const topic = /om[sz]et|laba/.test(words)
      ? "omzet-laba"
      : /hpp/.test(words)
        ? "hpp"
        : /margin/.test(words)
          ? "margin"
          : /aov|pesanan/.test(words)
            ? "aov"
            : /kas/.test(words)
              ? "kas"
              : /stok/.test(words)
                ? "stok"
                : /target/.test(words)
                  ? "target"
                  : (previous?.topic ?? "omzet-laba");
    const explanations: Record<string, [string, string]> = {
      "omzet-laba": [
        "Omzet dan laba",
        "Omzet adalah nilai penjualan bersih sebelum dikurangi biaya. Laba kotor adalah omzet dikurangi HPP barang yang terjual. Laba bersih mengurangi biaya usaha di luar HPP juga. Jadi, omzet besar belum tentu berarti laba besar.",
      ],
      hpp: [
        "Harga pokok penjualan",
        "HPP adalah biaya untuk barang yang benar-benar terjual pada periode yang dibahas. Pembelian persediaan yang belum terjual tidak langsung dianggap HPP. Data ini membantu menghitung laba kotor.",
      ],
      margin: [
        "Margin laba",
        "Margin menunjukkan bagian penjualan yang menjadi laba. Bedakan margin laba kotor dan laba bersih sesuai biaya yang dikurangi. Untuk usaha Anda, hitungannya membutuhkan penjualan dan biaya pada periode yang sama.",
      ],
      aov: [
        "Rata-rata nilai pesanan",
        "Rata-rata nilai pesanan adalah penjualan bersih dibagi jumlah pesanan unik. Beberapa baris produk dari pesanan yang sama tetap dihitung sebagai satu pesanan.",
      ],
      kas: [
        "Arus kas",
        "Arus kas menjelaskan uang yang benar-benar masuk dan keluar. Waktu pencairan pembayaran dapat berbeda dari waktu penjualan. Perhitungannya memerlukan saldo awal serta catatan uang masuk dan keluar.",
      ],
      stok: [
        "Persediaan",
        "Stok adalah barang yang masih tersedia. Catatan penjualan saja belum menunjukkan stok akhir; diperlukan stok awal, barang masuk, dan barang keluar.",
      ],
      target: [
        "Target usaha",
        "Target adalah sasaran dengan nilai dan periode yang jelas. RAMU membandingkannya dengan realisasi dari catatan usaha, lalu menghitung sisa yang perlu dikejar jika cakupan datanya cukup.",
      ],
    };
    [answer.title, answer.summary] =
      explanations[topic] ?? explanations["omzet-laba"];
    if (/sederhana|simpel/i.test(question) && topic === "omzet-laba")
      answer.summary =
        "Omzet itu total penjualan. Laba itu sisanya setelah biaya dikurangi. Jadi, banyak penjualan belum tentu banyak keuntungan.";
    context.topic = topic;
    answer.suggestions = [
      "Jelaskan lebih sederhana",
      "Apa langkah pertama saya?",
      "Bagaimana penjualan bulan ini?",
    ];
    return answer;
  }
  if (input.selection.invalidRange) {
    answer.title = "Periksa rentang tanggal";
    answer.summary =
      "Gunakan tanggal yang valid dan tulis awal sebelum akhir. Satu rentang dapat mencakup hingga 367 hari.";
    delete context.invalidRange;
    return finish();
  }
  if (request.unresolvedReference) {
    answer.title = "Produk mana yang Anda maksud?";
    answer.summary =
      "Urutan itu belum tersedia pada daftar sebelumnya. Sebutkan nama produknya atau tampilkan daftar produk terlebih dahulu.";
    answer.context = previous ?? context;
    answer.suggestions = [
      "Tampilkan lima produk",
      "Bagaimana penjualan bulan ini?",
    ];
    return finish();
  }
  if (intent === "target") {
    const entry = input.targetProgress?.(sellingDays);
    answer.title = "Kemajuan target omzet";
    answer.next = {
      href: sourceHref.startsWith("/demo")
        ? "/demo/target-bisnis"
        : "/target-bisnis",
      label: "Kelola target",
    };
    if (!entry) {
      answer.summary = "Belum ada target omzet aktif pada periode ini.";
      return finish();
    }
    const { target, progress } = entry;
    answer.range = formatRange(target.range, true);
    answer.summary =
      progress.unavailable ??
      (sellingDays === null
        ? "Gunakan kebutuhan harian ini untuk menilai apakah target masih realistis dibanding kapasitas jual Anda."
        : "Simulasi dengan " +
          formatNumber(progress.sellingDaysUsed ?? sellingDays) +
          " hari jual. Pengaturan target tetap berlaku.");
    answer.metrics.push({ label: "Target", value: rupiah(target.value) });
    if (progress.value !== null)
      answer.metrics.push({
        label: progress.ratio === null ? "Realisasi sementara" : "Realisasi",
        value: rupiah(progress.value),
      });
    if (progress.remaining !== null)
      answer.metrics.push({
        label: "Sisa target",
        value: rupiah(progress.remaining),
      });
    if (progress.perDay !== null)
      answer.metrics.push({
        label:
          sellingDays === null
            ? "Kebutuhan per hari"
            : "Simulasi per hari jual",
        value: rupiah(progress.perDay),
      });
    answer.suggestions = [
      "Berapa yang perlu dikejar per hari?",
      "Kalau tinggal 10 hari jual?",
    ];
    return finish();
  }
  if (intent === "unsupported") {
    answer.title =
      request.missingStock || request.missingCash
        ? "Data tambahan diperlukan"
        : "Informasi apa yang ingin diperiksa?";
    answer.summary =
      request.missingStock || request.missingCash
        ? "Sumber penjualan belum mencakup informasi tersebut."
        : "Saya bisa membantu memeriksa penjualan, pesanan, produk, target, atau laba pada periode tertentu.";
    return finish();
  }
  if (!report) {
    answer.next = { href: sourceHref, label: "Periksa sumber penjualan" };
    return finish();
  }
  if (intent === "overview" || intent === "advice") {
    const topics: ChatIntent[] = ["sales", "growth", "decline"];
    if (input.targetProgress) topics.push("target");
    if (input.costs?.length) topics.push("profit");
    const parts = topics.map((topic) =>
      analyzeChat({
        ...input,
        request: { ...request, intent: topic, product: undefined, pair: [] },
      }),
    );
    const sales = parts[0];
    const productParts = parts
      .slice(1, 3)
      .filter((part) => part.metrics.length);
    answer.title =
      intent === "advice" ? "Langkah untuk usaha Anda" : "Kondisi usaha Anda";
    answer.summary = `Pada ${answer.range}, penjualan bersih tercatat ${rupiah(report.totals.revenue)}${report.totals.orders === null ? "." : ` dari ${formatNumber(report.totals.orders)} pesanan unik.`}`;
    answer.metrics = sales.metrics
      .filter((metric) => !metric.label.startsWith("Pembanding"))
      .slice(0, 3);
    for (const part of parts.slice(1)) {
      const selected =
        part.context.intent === "profit"
          ? part.metrics.slice(-2)
          : part.context.intent === "target" && part.metrics.length > 2
            ? [part.metrics[0], part.metrics[1], part.metrics.at(-1)!]
            : part.metrics.slice(0, 2);
      for (const metric of selected) {
        if (answer.metrics.length >= 12) break;
        const label = part.title + " · " + metric.label;
        if (
          !answer.metrics.some(
            (item) => item.label === label && item.value === metric.value,
          )
        )
          answer.metrics.push({
            label,
            value: metric.value,
          });
      }
    }
    answer.advice =
      intent === "advice"
        ? "Mulai dengan memeriksa produk yang berubah paling besar. Cocokkan dengan catatan stok, harga, dan promosi sebelum menentukan tindakan. Saran ini perlu disesuaikan dengan kapasitas usaha Anda."
        : productParts.length
          ? productParts.map((part) => part.summary).join(" ")
          : "Rincian produk akan membantu melihat bagian usaha yang perlu diperhatikan.";
    answer.evidence = sales.evidence;
    answer.supportingEvidence = productParts
      .flatMap((part) =>
        part.evidence
          ? [{ href: part.evidence, label: "Lihat rincian produk" }]
          : [],
      )
      .filter(
        (item, index, all) =>
          all.findIndex((other) => other.href === item.href) === index,
      );
    answer.suggestions = [
      "Apa yang sebaiknya saya prioritaskan?",
      "Produk mana yang perlu diperhatikan?",
      "Bagaimana dengan target omzet?",
    ];
    return finish();
  }
  if (intent === "profit" || intent === "gross") {
    const cost = periodCost(input.costs ?? [], report.active);
    const profit = calculateProfit(report.totals.revenue, cost);
    const value = intent === "gross" ? profit.gross : profit.net;
    answer.title = intent === "gross" ? "Laba kotor" : "Laba bersih";
    answer.metrics = [
      { label: "Penjualan bersih", value: rupiah(report.totals.revenue) },
    ];
    if (cost?.cost_of_goods != null)
      answer.metrics.push({
        label: "HPP barang terjual",
        value: rupiah(cost.cost_of_goods),
      });
    if (intent === "profit" && cost?.operating_cost != null)
      answer.metrics.push({
        label: "Biaya usaha",
        value: rupiah(cost.operating_cost),
      });
    answer.evidence = input.evidenceHref("time");
    if (value === null) {
      answer.summary =
        profit.gross === null
          ? "Catat HPP barang yang terjual untuk rentang tanggal ini."
          : "Catat biaya usaha di luar HPP untuk rentang tanggal ini.";
      answer.next = {
        href: sourceHref.startsWith("/demo")
          ? "/demo/sumber-data"
          : "/sumber-data/biaya?" +
            new URLSearchParams({
              awal: report.active.start,
              akhir: report.active.end,
            }),
        label: "Lengkapi data biaya",
      };
    } else {
      answer.metrics.push({
        label: report.incomplete ? "Laba sementara" : answer.title,
        value: rupiah(value),
      });
      answer.summary =
        intent === "gross"
          ? "Penjualan bersih dikurangi HPP barang yang terjual."
          : "Penjualan bersih dikurangi HPP dan biaya usaha di luar HPP.";
    }
    return finish();
  }
  if (intent === "sales" || intent === "orders" || intent === "average") {
    const { revenue, orders, average } = report.totals;
    answer.title =
      intent === "orders"
        ? "Jumlah pesanan"
        : intent === "average"
          ? "Rata-rata nilai pesanan"
          : "Ringkasan penjualan";
    answer.summary =
      orders === null
        ? "ID pesanan yang sah diperlukan untuk menghitung pesanan unik dan rata-rata."
        : orders === 0
          ? "Tidak ada pesanan sah dalam cakupan ini. Rata-rata belum dapat dihitung."
          : intent === "average"
            ? "Setiap pesanan rata-rata menyumbang " +
              rupiah(average ?? 0) +
              ". Angka ini memakai pesanan unik yang tercatat."
            : intent === "orders"
              ? "Ada " +
                formatNumber(orders) +
                " pesanan unik dalam periode ini."
              : "Penjualan bersih pada periode ini mencapai " +
                rupiah(revenue) +
                ". Anda bisa melihat perbandingan periode dan rincian pendukungnya di bawah.";
    if (/\b(pencairan|dana cair)\b/i.test(question))
      answer.advice =
        "Pencairan dana memerlukan laporan settlement dan potongan kanal. Angka ini menunjukkan penjualan dari sumber aktif.";
    if (
      /\b(kenapa|mengapa)\b.*\b(turun|naik)\b/i.test(question) &&
      report.comparison
    ) {
      const before = report.comparison.totals.revenue;
      answer.summary =
        revenue > before
          ? "Pada periode ini penjualan justru lebih tinggi dari pembanding. Periksa angka perubahan di bawah sebelum mencari penyebab penurunan."
          : revenue === before
            ? "Nilai penjualan sama dengan periode pembanding. Belum ada perubahan total yang perlu dijelaskan."
            : "Penjualan lebih rendah dari periode pembanding. Data penjualan menunjukkan polanya, tetapi belum membuktikan penyebabnya. Cocokkan dengan catatan stok, harga, dan promosi.";
    }
    answer.metrics = [
      { label: "Penjualan bersih", value: rupiah(revenue) },
      {
        label: "Pesanan unik",
        value: orders === null ? "Belum tersedia" : formatNumber(orders),
      },
      {
        label: "Rata-rata pesanan",
        value: average === null ? "Belum tersedia" : rupiah(average),
      },
    ];
    if (report.comparison) {
      const before = report.comparison.totals;
      const percentageChangeValue =
        intent === "orders"
          ? percentageChange(orders, before.orders)
          : intent === "average"
            ? percentageChange(average, before.average)
            : percentageChange(revenue, before.revenue);
      const previousValue =
        intent === "orders"
          ? before.orders
          : intent === "average"
            ? before.average
            : before.revenue;
      answer.metrics.push({
        label: "Pembanding · " + formatRange(report.comparison.range, true),
        value:
          previousValue === null
            ? "Belum tersedia"
            : intent === "orders"
              ? formatNumber(previousValue)
              : rupiah(previousValue),
      });
      answer.metrics.push({
        label: "Perubahan",
        value:
          percentageChangeValue === null
            ? "Persentase belum tersedia"
            : percentage.format(percentageChangeValue) + "%",
      });
    }
    answer.evidence = input.evidenceHref("time");
    answer.suggestions = [
      "Bandingkan dengan bulan lalu",
      "Produk mana yang paling berpengaruh?",
    ];
    return finish();
  }

  if (
    product &&
    (intent === "decline" || intent === "growth" || intent === "products")
  ) {
    const item = report.products?.find(({ name }) => name === product);
    if (!item) {
      answer.title = "Produk belum ditemukan pada periode ini";
      answer.summary = "Pilih produk yang muncul pada periode terpilih.";
      answer.suggestions = ["Tampilkan tiga produk"];
      return finish();
    }
    answer.title = item.name;
    answer.summary =
      item.movement === null
        ? "Cakupan pembanding produk belum tersedia."
        : item.movement < 0
          ? "Nilai penjualan produk ini lebih rendah dari pembanding."
          : item.movement > 0
            ? "Nilai penjualan produk ini naik dari pembanding."
            : "Nilai penjualan sama dengan pembanding.";
    answer.metrics = [
      { label: "Penjualan bersih", value: rupiah(item.revenue) },
    ];
    if (item.previous !== null)
      answer.metrics.push({
        label: "Pembanding",
        value: rupiah(item.previous),
      });
    if (item.movement !== null)
      answer.metrics.push({ label: "Selisih", value: rupiah(item.movement) });
    answer.advice = request.includeAdvice
      ? `Untuk ${item.name}, pastikan produk tersedia dan penawarannya jelas. Coba perbaiki foto atau deskripsi, lalu uji sebagai pelengkap produk yang lebih diminati. Periksa HPP sebelum memberi diskon, dan bandingkan hasil pada rentang yang setara. Sumber penjualan belum menunjukkan penyebab perubahan.`
      : "Periksa perubahan stok, harga, atau promosi. Sumber penjualan belum menunjukkan penyebab perubahan.";
    if (request.includeAdvice) answer.summary += "\n\n" + answer.advice;
    answer.evidence = input.evidenceHref("product");
    answer.suggestions = [
      "Bandingkan sama yang pertama",
      "Tampilkan tiga produk",
    ];
    return finish();
  }

  if (intent === "products") {
    const lowest = request.ranking === "lowest";
    answer.title = lowest
      ? "Produk dengan penjualan terendah"
      : "Produk dengan penjualan tertinggi";
    if (request.unsupportedUnits) {
      answer.title = "Jumlah unit per produk belum tersedia";
      answer.summary =
        "Data ini memuat nilai penjualan per produk, tetapi belum memuat jumlah unit yang terjual. Produk dengan omzet terendah belum tentu paling sedikit dibeli. Mau saya urutkan berdasarkan nilai penjualannya?";
      answer.suggestions = [
        "Produk mana yang omzetnya paling rendah?",
        "Produk mana yang paling laris?",
      ];
      return finish();
    }
    const top = [...(report.products ?? [])]
      .sort(
        (a, b) =>
          (lowest ? a.revenue - b.revenue : b.revenue - a.revenue) ||
          a.name.localeCompare(b.name, "id"),
      )
      .slice(0, request.limit);
    context.products = top.map(({ name }) => name);
    context.product = undefined;
    answer.metrics = top.map(({ name, revenue }) => ({
      label: name,
      value: rupiah(revenue),
    }));
    answer.summary = top.length
      ? `${top[0].name} memiliki nilai penjualan bersih ${lowest ? "terendah" : "tertinggi"} pada periode ini, yaitu ${rupiah(top[0].revenue)}.${top.length > 1 ? " Urutan produk berikutnya terlihat pada rincian angka." : ""} Patokan ini memakai omzet, bukan jumlah unit terjual.`
      : "Rincian memerlukan nama produk dan nilai penjualan per item.";
    if (request.includeAdvice && top.length) {
      answer.advice = lowest
        ? `Untuk ${top[0].name}, periksa dulu apakah produk tersedia dan mudah ditemukan pelanggan. Jika tersedia, coba perbaiki foto atau deskripsi, tawarkan sebagai pelengkap produk yang sudah diminati, lalu bandingkan hasil pada rentang waktu yang setara. Periksa HPP sebelum memberi diskon agar margin tetap terjaga. Data penjualan saja belum membuktikan penyebab produk kurang laris.`
        : `Pastikan ketersediaan ${top[0].name} tetap terjaga. Uji penawaran produk pelengkap dan pantau margin sebelum menambah promosi. Strategi ini perlu dicocokkan dengan catatan biaya dan kapasitas usaha.`;
      answer.summary += "\n\n" + answer.advice;
    }
    if (top.length) answer.evidence = input.evidenceHref("product");
    answer.suggestions = lowest
      ? [
          "Bagaimana strategi untuk produk ini?",
          "Bandingkan dengan produk terlaris",
        ]
      : top.length > 1
        ? ["Yang kedua kenapa turun?", "Bandingkan keduanya"]
        : suggestions;
    return finish();
  }

  const basic = assistantAnswer(intent as Intent, report, pair);
  answer.title = basic.title;
  answer.summary = basic.summary;
  answer.metrics = basic.metrics ?? [];
  answer.advice = basic.suggestion;
  if (basic.evidence)
    answer.evidence = input.evidenceHref(
      basic.evidence.kind,
      basic.evidence.kind === "time" ? basic.evidence.date : undefined,
    );
  if (basic.evidence?.kind === "product" && basic.evidence.names.length) {
    context.products = basic.evidence.names;
    context.product =
      basic.evidence.names.length === 1 ? basic.evidence.names[0] : undefined;
  }
  if (basic.recovery === "source")
    answer.next = { href: sourceHref, label: "Periksa sumber data" };
  if (basic.recovery === "products")
    answer.suggestions = (report.products ?? [])
      .slice(0, 3)
      .map(({ name }) => "Lihat produk " + name);
  if (pair.length === 2 && intent === "compare") {
    context.products = pair;
    context.product = undefined;
  }
  return finish();
}
