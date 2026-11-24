import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/auth/actions";
import { currentAccount } from "@/server/account";
import { supabaseConfig } from "@/server/supabase-http";
import { Wordmark } from "./brand";
import { DemoPreview } from "./demo-preview";
import { PasswordLogin } from "./password-login";
import { EmailSignup } from "./email-signup";
import { signupAvailability, turnstileSiteKey } from "@/server/signup-security";
import { loginDestination } from "@/domain/login-destination";

export async function AccountPage({
  register,
  status,
  lanjut,
  emailSignup = false,
}: {
  register?: boolean;
  status?: string | string[];
  lanjut?: string | string[];
  emailSignup?: boolean;
}) {
  const destination = loginDestination(lanjut);
  if (await currentAccount()) redirect(destination ?? "/dashboard");
  const configured = Boolean(supabaseConfig());
  const siteKey = turnstileSiteKey();
  const registrationReady =
    register && emailSignup ? (await signupAvailability()).ready : false;
  return (
    <main
      className={
        "account" + (register && emailSignup ? " account-email-form" : "")
      }
    >
      <div className="account-preview">
        <Wordmark />
        <DemoPreview />
        <p className="account-formats">Google Sheets · Excel / CSV</p>
      </div>
      <section className="account-main" aria-labelledby="account-title">
        <h1 id="account-title">
          <span className="account-web-copy">
            {register ? "Daftar akun RAMU" : "Masuk ke RAMU"}
          </span>
          <span className="account-mobile-copy">
            {register ? "Daftar akun" : "Masuk"}
          </span>
        </h1>
        <p className="account-web-copy">
          {register
            ? "Buat akun dengan Google atau daftarkan email Anda."
            : "Masuk dengan email dan password RAMU atau akun Google."}
        </p>
        <p className="account-mobile-copy">
          {register
            ? "Buat akun dengan Google atau email Anda."
            : "Gunakan email dan password RAMU atau lanjutkan dengan Google."}
        </p>
        {status === "google" && (
          <p className="form-message" role="alert">
            Masuk dengan Google belum selesai. Silakan coba lagi.
          </p>
        )}
        {status === "tautan" && (
          <p className="form-message" role="alert">
            Tautan masuk sudah kedaluwarsa, sudah digunakan, atau dibuka di
            browser berbeda. Coba masuk dengan email, atau{" "}
            <Link href="/daftar/verifikasi">kirim ulang email konfirmasi</Link>.
          </p>
        )}
        {!configured && (
          <p className="form-message" role="status">
            Login RAMU belum dikonfigurasi. Dashboard demo tetap tersedia.
          </p>
        )}
        {!register && (
          <>
            <PasswordLogin
              configured={configured}
              destination={destination}
              siteKey={siteKey}
            />
            <div className="account-divider">atau</div>
          </>
        )}
        {register && emailSignup && (
          <>
            <EmailSignup
              ready={registrationReady}
              siteKey={siteKey}
              destination={destination}
            />
            <div className="account-divider">atau</div>
          </>
        )}
        <form action={signInWithGoogle}>
          {destination && (
            <input type="hidden" name="lanjut" value={destination} />
          )}
          <button
            className={
              register && !emailSignup ? "button primary" : "button outline"
            }
            type="submit"
            disabled={!configured}
          >
            <span className="account-web-copy">
              {register ? "Daftar dengan Google" : "Masuk dengan Google"}
            </span>
            <span className="account-mobile-copy">Lanjutkan dengan Google</span>
          </button>
        </form>
        {register && !emailSignup && (
          <Link
            className="button outline"
            href={
              "/daftar?" +
              new URLSearchParams({
                metode: "email",
                ...(destination ? { lanjut: destination } : {}),
              })
            }
          >
            Daftar dengan email
          </Link>
        )}
        <p className="account-switch">
          {register ? "Sudah punya akun? " : "Belum punya akun? "}
          <Link
            href={
              (register ? "/masuk" : "/daftar") +
              (destination
                ? "?" + new URLSearchParams({ lanjut: destination })
                : "")
            }
          >
            {register ? "Masuk" : "Daftar"}
          </Link>
        </p>
        <Link className="button account-signin" href="/demo">
          Coba data contoh
        </Link>
        <p className="account-policy">
          Dengan melanjutkan, Anda menyetujui{" "}
          <Link href="/ketentuan">Ketentuan Penggunaan</Link> dan{" "}
          <Link href="/privasi">Kebijakan Privasi</Link>.
        </p>
        <Link className="button quiet" href="/">
          Kembali
        </Link>
      </section>
    </main>
  );
}
