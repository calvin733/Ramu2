"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Splash } from "./brand";

const splashDurationMs = 3000;

export function InitialSplash({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const splash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let timer: number;
    const minimumDuration = new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, splashDurationMs);
    });
    const animations = splash.current?.getAnimations({ subtree: true }) ?? [];
    void Promise.all([
      minimumDuration,
      document.fonts.ready.catch(() => undefined),
      ...animations.map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    ]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {!ready && (
        <div
          className="initial-splash"
          ref={splash}
          style={
            { "--splash-duration": `${splashDurationMs}ms` } as CSSProperties
          }
        >
          <Splash />
        </div>
      )}
      <div inert={!ready}>{children}</div>
      <noscript>
        <p className="noscript-notice">
          Aktifkan JavaScript untuk membuka demo interaktif RAMU.
        </p>
      </noscript>
    </>
  );
}
