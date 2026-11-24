"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Turnstile = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export function AuthCaptcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (value: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const receive = useRef(onToken);
  const [error, setError] = useState(false);
  receive.current = onToken;
  const mount = useCallback(() => {
    if (!node.current || !window.turnstile || widget.current !== null) return;
    receive.current("");
    widget.current = window.turnstile.render(node.current, {
      sitekey: siteKey,
      theme: "light",
      language: "id",
      size: window.matchMedia("(max-width: 380px)").matches
        ? "compact"
        : "flexible",
      "response-field": false,
      callback: (token: string) => {
        if (node.current?.isConnected) {
          receive.current(token);
          setError(false);
        }
      },
      "expired-callback": () => {
        receive.current("");
      },
      "timeout-callback": () => {
        receive.current("");
        setError(true);
      },
      "error-callback": () => {
        receive.current("");
        setError(true);
      },
    });
  }, [siteKey]);
  useEffect(() => {
    mount();
    return () => {
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [mount]);
  return (
    <div className="auth-captcha">
      <Script
        id="ramu-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={mount}
        onError={() => setError(true)}
      />
      <div ref={node} aria-label="Pemeriksaan keamanan" />
      {error && (
        <p role="status">
          Pemeriksaan keamanan belum berhasil.{" "}
          <button
            type="button"
            onClick={() => {
              receive.current("");
              setError(false);
              if (widget.current !== null)
                window.turnstile?.reset(widget.current);
              else window.location.reload();
            }}
          >
            Coba lagi
          </button>
        </p>
      )}
    </div>
  );
}
