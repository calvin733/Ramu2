import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { understandSales } from "../src/server/import/assistant.ts";
const env = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
// Only invented headings and generic type patterns reach the provider.
const sheet = {
  headers: [
    "Tgl beres order",
    "Kode nota belanja",
    "Barang terjual",
    "Status order",
    "Banyak pcs",
    "Harga barang sesudah diskon",
  ],
  rows: [
    {
      number: 2,
      cells: [
        "2026-11-01",
        "SYNTHETIC-1",
        "Barang contoh",
        "Selesai",
        "2",
        "300000",
      ],
    },
    {
      number: 3,
      cells: [
        "2026-11-01",
        "SYNTHETIC-1",
        "Barang contoh lain",
        "Selesai",
        "1",
        "200000",
      ],
    },
  ],
};
const liveFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const response = await liveFetch(input, options);
  const data = await response
    .clone()
    .json()
    .catch(() => ({}));
  const candidate = data.candidates?.[0];
  const output = candidate?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  let shape;
  try {
    shape = Object.keys(JSON.parse(output));
  } catch {
    shape = output ? "invalid-json" : undefined;
  }
  console.log(
    JSON.stringify({
      httpStatus: response.status,
      errorStatus: data.error?.status,
      finishReason: candidate?.finishReason,
      outputShape: shape,
      outputCharacters: output?.length,
      usage: data.usageMetadata,
    }),
  );
  return response;
};
try {
  const result = await understandSales(sheet, {
    business: "synthetic-import-verification",
    timezone: "Asia/Jakarta",
    source: "synthetic-only",
  });
  console.log(
    JSON.stringify(
      {
        provider: result.reading.provider,
        automaticPreview: result.guidance.canPreview,
        clarification: result.reading.question?.field ?? null,
        notice: result.reading.notice ?? null,
        privacy:
          "Only synthetic headings and type patterns; raw cells are excluded.",
      },
      null,
      2,
    ),
  );
  process.exitCode = result.reading.provider === "gemini" ? 0 : 2;
} catch {
  console.error(
    "Verification did not complete; no keys or source data printed.",
  );
  process.exitCode = 1;
}
