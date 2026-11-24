import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const env = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const email = process.env.RAMU_TESTER_EMAIL?.trim().toLowerCase();
const password = process.env.RAMU_TESTER_PASSWORD;
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (url !== "https://qyegwniyzxyvsxftqcrb.supabase.co") {
  console.error(
    "Pembuatan akun hanya diizinkan pada proyek development Ramu yang ditentukan.",
  );
  process.exitCode = 2;
} else if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password, "utf8") > 72 ||
  !key
) {
  console.error(
    "Isi RAMU_TESTER_EMAIL dan RAMU_TESTER_PASSWORD di .env.local. Gunakan password RAMU khusus, minimal 12 karakter dan maksimal 72 byte. Secret key Supabase juga diperlukan. Kredensial tidak dicetak.",
  );
  process.exitCode = 2;
} else {
  try {
    const headers = { apikey: key, "content-type": "application/json" };
    if (key.startsWith("eyJ")) headers.authorization = "Bearer " + key;
    const response = await fetch(url + "/auth/v1/admin/users", {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { ramu_tester: true },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        [
          "email_exists",
          "email_address_exists",
          "user_already_exists",
        ].includes(result.code ?? result.error_code) || response.status === 422
          ? "Akun tidak dibuat. Email mungkin sudah terdaftar atau tidak memenuhi persyaratan. Tidak ada password akun lama yang diubah."
          : "Akun belum dapat dibuat. Periksa layanan Auth dan konfigurasi proyek.",
      );
      process.exitCode = 1;
    } else {
      console.log(
        "Akun tester RAMU berhasil dibuat dan siap masuk melalui /masuk. Gunakan email dan password RAMU yang Anda simpan sendiri; login Google tidak diperlukan.",
      );
    }
  } catch {
    console.error(
      "Koneksi Auth belum tersedia. Periksa keberadaan akun di Supabase sebelum mengulangi; password tidak dicetak.",
    );
    process.exitCode = 1;
  }
}
