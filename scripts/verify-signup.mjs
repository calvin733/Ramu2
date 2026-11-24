import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const env = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const { signupAvailability, turnstileSiteKey } =
  await import("../src/server/signup-security.ts");
const result = await signupAvailability(true);
console.log(
  JSON.stringify({
    turnstileSiteKeyConfigured: Boolean(turnstileSiteKey()),
    ...result,
  }),
);
console.log(
  "Pemeriksaan memakai alamat email tidak valid dan token CAPTCHA tidak valid. Tidak membuat akun dan tidak mengirim email. Pengiriman ke inbox perlu diuji terpisah melalui formulir.",
);
if (!result.ready) process.exitCode = 2;
