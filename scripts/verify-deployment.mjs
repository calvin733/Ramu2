// Read-only configuration preflight. Does not contact services, deploy or print keys.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const env = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const production = process.argv.includes("--production");
const checks = [];
function check(name, pass, action, required = true) {
  checks.push({
    name,
    status: pass ? "siap" : required ? "perlu_diisi" : "opsional",
    ...(pass ? {} : { action }),
  });
}
let origin;
try {
  origin = new URL(process.env.RAMU_APP_URL ?? "");
} catch {}
const local =
  !origin || ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
check(
  "RAMU_APP_URL",
  Boolean(
    origin &&
    !origin.username &&
    !origin.password &&
    !origin.search &&
    !origin.hash &&
    origin.pathname === "/" &&
    (production
      ? origin.protocol === "https:" && !local
      : ["http:", "https:"].includes(origin.protocol)),
  ),
  production
    ? "Isi origin HTTPS domain production Vercel yang tetap; localhost tidak berlaku di production."
    : "Isi origin RAMU yang benar.",
);
let database;
try {
  database = new URL(process.env.SUPABASE_URL ?? "");
} catch {}
check(
  "SUPABASE_URL",
  Boolean(database?.protocol === "https:"),
  "Isi URL Supabase proyek yang menyimpan akun tester.",
);
for (const name of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"])
  check(
    name,
    Boolean(process.env[name]?.trim()),
    "Isi melalui Environment Variables Vercel; secret key hanya untuk server.",
  );
check(
  "GOOGLE_SHEETS_CLIENT_ID",
  /^[A-Za-z0-9.-]+\.apps\.googleusercontent\.com$/.test(
    process.env.GOOGLE_SHEETS_CLIENT_ID?.trim() ?? "",
  ),
  "Isi OAuth client Web application untuk Google Sheets.",
);
check(
  "GOOGLE_SHEETS_PICKER_KEY",
  /^[A-Za-z0-9_-]{10,200}$/.test(
    process.env.GOOGLE_SHEETS_PICKER_KEY?.trim() ?? "",
  ),
  "Isi API key Google Picker dari proyek yang sama.",
);
check(
  "GOOGLE_SHEETS_PROJECT_NUMBER",
  /^\d{1,20}$/.test(process.env.GOOGLE_SHEETS_PROJECT_NUMBER?.trim() ?? ""),
  "Isi Project number numerik proyek Google Cloud.",
);
const clientProject = /^(\d+)-/.exec(
  process.env.GOOGLE_SHEETS_CLIENT_ID?.trim() ?? "",
)?.[1];
if (clientProject)
  check(
    "Sheets OAuth / project number",
    clientProject === process.env.GOOGLE_SHEETS_PROJECT_NUMBER?.trim(),
    "Periksa bahwa Client ID dan Project number diambil dari proyek Google Cloud yang sama.",
  );
check(
  "TURNSTILE_SITE_KEY",
  Boolean(process.env.TURNSTILE_SITE_KEY?.trim()),
  "Diperlukan untuk pendaftaran email publik. Akun tester yang sudah dibuat dapat masuk tanpa pendaftaran baru.",
  false,
);
check(
  "GEMINI_API_KEY",
  Boolean(process.env.GEMINI_API_KEY?.trim()),
  "Diperlukan jika ingin menguji Gemini sesuai mode layanan yang dipilih.",
  false,
);
if (production) {
  check(
    "Gemini import enabled",
    process.env.GEMINI_IMPORT_ENABLED === "true" &&
      Boolean(process.env.GEMINI_API_KEY?.trim()),
    "Aktifkan pemahaman struktur dengan key Gemini server yang valid.",
  );
  check(
    "Gemini production service",
    process.env.GEMINI_SERVICE_TIER === "paid",
    "Layanan AI untuk sumber usaha production memerlukan proyek Gemini dengan billing aktif; jangan hanya mengubah flag tanpa mengonfigurasi proyek.",
  );
}
console.log(
  JSON.stringify(
    {
      mode: production ? "production" : "local",
      checks,
      externalChecksRequired: [
        "Google OAuth External Published/Production untuk pengguna umum, verifikasi yang berlaku, dan JavaScript origins",
        "Pembatasan website pada API key Picker",
        "Supabase Site URL dan Redirect URLs",
        "Login, izin Google, preview, aktivasi dan pembaruan pada domain deployment",
      ],
      note: "Lulus format konfigurasi tidak membuktikan izin Google atau kesiapan deployment. Skrip tidak membaca pengaturan remote.",
    },
    null,
    2,
  ),
);
process.exitCode = checks.some((c) => c.status === "perlu_diisi") ? 2 : 0;
