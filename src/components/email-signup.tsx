"use client";

import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, MailCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { resendVerificationEmail, signUpWithEmail } from "@/app/auth/actions";
import { AuthCaptcha } from "./auth-captcha";
import "./password-login.css";

export function EmailSignup({
  ready,
  siteKey,
  destination,
}: {
  ready: boolean;
  siteKey?: string;
  destination?: string;
}) {
  const [state, action, pending] = useActionState(signUpWithEmail, {});
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const enabled = ready && Boolean(siteKey);
  return (
    <form action={action} className="password-login" aria-busy={pending}>
      {destination && <input type="hidden" name="lanjut" value={destination} />}
      <input type="hidden" name="captcha_token" value={token} />
      <div className="signup-honeypot" aria-hidden="true">
        <label htmlFor="signup-contact">Website</label>
        <input
          id="signup-contact"
          name="contact_url"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="password-login-field">
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
          defaultValue={state.email}
          placeholder="nama@email.com"
          disabled={!enabled}
          readOnly={pending}
        />
      </div>
      <div className="password-login-field">
        <label htmlFor="signup-password">Password</label>
        <div className="password-login-input">
          <input
            id="signup-password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            placeholder="Minimal 8 karakter"
            disabled={!enabled}
            readOnly={pending}
            aria-describedby="signup-password-help"
          />
          <button
            type="button"
            aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={visible}
            disabled={!enabled || pending}
            onClick={() => setVisible(!visible)}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
        <p id="signup-password-help" className="signup-help">
          Gunakan minimal 8 karakter.
        </p>
      </div>
      <div className="password-login-field">
        <label htmlFor="signup-confirmation">Konfirmasi password</label>
        <input
          id="signup-confirmation"
          name="password_confirmation"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          placeholder="Ulangi password"
          disabled={!enabled}
          readOnly={pending}
        />
      </div>
      {enabled && siteKey && (
        <AuthCaptcha
          key={state.responseId ?? "signup"}
          siteKey={siteKey}
          onToken={setToken}
        />
      )}
      {!enabled && (
        <p className="signup-unavailable" role="status">
          Pendaftaran email sedang disiapkan. Anda dapat mendaftar dengan
          Google.
        </p>
      )}
      {state.error && (
        <p className="password-login-error" role="alert">
          {state.error}
        </p>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={!enabled || !token || pending}
      >
        {pending && (
          <LoaderCircle
            size={17}
            className="password-login-spinner"
            aria-hidden="true"
          />
        )}
        {pending ? "Membuat akun…" : "Buat akun RAMU"}
      </button>
    </form>
  );
}

export function EmailVerification({
  email,
  initialWait,
  siteKey,
  ready,
  destination,
  invalidLink,
}: {
  email: string;
  initialWait: number;
  siteKey?: string;
  ready: boolean;
  destination?: string;
  invalidLink: boolean;
}) {
  const [state, action, pending] = useActionState(resendVerificationEmail, {});
  const [token, setToken] = useState("");
  const [seconds, setSeconds] = useState(initialWait);
  useEffect(() => {
    const end = Date.now() + (state.retryAfter ?? initialWait) * 1000;
    const update = () =>
      setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [initialWait, state.responseId, state.retryAfter]);
  return (
    <div className="email-verification">
      <span className="verification-icon" aria-hidden="true">
        <MailCheck size={30} />
      </span>
      <h1>Periksa email Anda</h1>
      <p>
        Buka tautan konfirmasi pada email dari RAMU sebelum masuk. Periksa
        folder Spam jika email belum terlihat.
      </p>
      {invalidLink && (
        <p className="signup-unavailable" role="status">
          Tautan sudah kedaluwarsa, sudah digunakan, atau dibuka di browser
          berbeda. Coba masuk jika email sudah terverifikasi, atau kirim tautan
          baru dan buka di browser ini.
        </p>
      )}
      <form action={action} className="password-login" aria-busy={pending}>
        {destination && (
          <input type="hidden" name="lanjut" value={destination} />
        )}
        <input type="hidden" name="captcha_token" value={token} />
        <div className="password-login-field">
          <label htmlFor="verification-email">Email</label>
          <input
            id="verification-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={state.email ?? email}
            readOnly={pending}
            placeholder="nama@email.com"
          />
        </div>
        {ready && siteKey && (
          <AuthCaptcha
            key={state.responseId ?? "resend"}
            siteKey={siteKey}
            onToken={setToken}
          />
        )}
        {!ready && (
          <p className="signup-unavailable">
            Pengiriman ulang email belum tersedia. Anda tetap dapat membuka
            tautan yang sudah diterima.
          </p>
        )}
        {state.sent && (
          <p className="verification-success" role="status">
            Jika alamat ini terdaftar dan belum diverifikasi, email konfirmasi
            akan dikirim. Jika sudah memiliki akun aktif, silakan masuk.
          </p>
        )}
        {state.error && (
          <p className="password-login-error" role="alert">
            {state.error}
          </p>
        )}
        <button
          className="button outline"
          type="submit"
          disabled={!ready || !token || pending || seconds > 0}
        >
          {pending
            ? "Mengirim…"
            : seconds > 0
              ? "Kirim ulang dalam " + seconds + " detik"
              : "Kirim ulang email"}
        </button>
      </form>
      <Link
        className="button primary"
        href={
          "/masuk" +
          (destination
            ? "?" + new URLSearchParams({ lanjut: destination })
            : "")
        }
      >
        Ke halaman Masuk
      </Link>
      <Link
        className="verification-back"
        href={
          "/daftar?" +
          new URLSearchParams({
            metode: "email",
            ...(destination ? { lanjut: destination } : {}),
          })
        }
      >
        Ubah email atau daftar kembali
      </Link>
    </div>
  );
}
