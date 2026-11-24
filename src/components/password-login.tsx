"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signInWithEmail } from "@/app/auth/actions";
import "./password-login.css";
import { AuthCaptcha } from "./auth-captcha";

export function PasswordLogin({
  configured,
  destination,
  siteKey,
}: {
  configured: boolean;
  destination?: string;
  siteKey?: string;
}) {
  const [state, action, pending] = useActionState(signInWithEmail, {});
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState("");
  return (
    <form action={action} className="password-login" aria-busy={pending}>
      {destination && <input type="hidden" name="lanjut" value={destination} />}
      <input type="hidden" name="captcha_token" value={token} />
      <div className="password-login-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          maxLength={254}
          required
          defaultValue={state.email}
          placeholder="nama@email.com"
          readOnly={pending}
          disabled={!configured}
          aria-describedby={state.error ? "password-login-error" : undefined}
        />
      </div>
      <div className="password-login-field">
        <label htmlFor="login-password">Password RAMU</label>
        <div className="password-login-input">
          <input
            id="login-password"
            type={visible ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            maxLength={256}
            required
            placeholder="Masukkan password RAMU"
            readOnly={pending}
            disabled={!configured}
            aria-describedby={state.error ? "password-login-error" : undefined}
          />
          <button
            type="button"
            aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            disabled={pending || !configured}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {siteKey && (
        <AuthCaptcha
          key={state.responseId ?? "login"}
          siteKey={siteKey}
          onToken={setToken}
        />
      )}
      {state.error && (
        <p
          id="password-login-error"
          className="password-login-error"
          role="alert"
        >
          {state.error}
        </p>
      )}
      {state.confirmationRequired && (
        <Link className="verification-back" href="/daftar/verifikasi">
          Kirim ulang email konfirmasi
        </Link>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={!configured || pending || Boolean(siteKey && !token)}
      >
        {pending && (
          <LoaderCircle
            size={17}
            className="password-login-spinner"
            aria-hidden="true"
          />
        )}
        {pending ? "Sedang masuk…" : "Masuk"}
      </button>
    </form>
  );
}
