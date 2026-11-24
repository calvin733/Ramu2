"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSourcePaused } from "@/app/(usaha)/sumber-data/actions";
import type { GoogleSheetRef, SheetsPickerConfig } from "@/domain/import-types";
import { ImportWizard } from "./import-wizard";
import { SourceOptions } from "./source-options";

export function SourceControls({
  revision,
  label,
  paused,
  sheetsConfig,
  googleSource,
  manage = false,
}: {
  revision: string;
  label: string;
  paused: boolean;
  sheetsConfig: SheetsPickerConfig | null;
  googleSource?: GoogleSheetRef;
  manage?: boolean;
}) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const router = useRouter();
  const changeLabel = paused ? "Aktifkan kembali sumber" : "Nonaktifkan sumber";

  function confirmStatus() {
    setError("");
    startTransition(async () => {
      try {
        const result = await setSourcePaused(revision, !paused);
        if (result.error) {
          setError(result.error);
          return;
        }
        dialog.current?.close();
        router.refresh();
      } catch {
        setError("Status sumber belum dapat dikonfirmasi. Coba lagi.");
      }
    });
  }

  return (
    <>
      {manage || !paused ? (
        <button
          className="button primary"
          type="button"
          aria-expanded={manage ? importing : undefined}
          aria-haspopup={manage ? undefined : "dialog"}
          onClick={() => setImporting(manage ? !importing : true)}
        >
          {manage ? "Ganti sumber" : "Perbarui data"}
        </button>
      ) : null}
      {manage && (
        <>
          <button
            className="button outline"
            type="button"
            onClick={() => {
              setError("");
              dialog.current?.showModal();
            }}
          >
            {changeLabel}
          </button>
          <dialog
            ref={dialog}
            className="import-dialog"
            aria-labelledby={title}
            onCancel={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            <div className="import-content" aria-busy={pending}>
              <h2 id={title}>{changeLabel}?</h2>
              <p>
                <strong>{label}</strong>
              </p>
              <p>
                {paused
                  ? "Anda dapat memperbarui sumber ini kembali."
                  : "Pembaruan dari sumber ini akan berhenti. Data terakhir tetap dapat dilihat."}
              </p>
              {error && (
                <p className="form-message" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                type="button"
                disabled={pending}
                onClick={confirmStatus}
              >
                {pending ? "Memproses…" : changeLabel}
              </button>
              <button
                className="button quiet"
                type="button"
                disabled={pending}
                onClick={() => dialog.current?.close()}
              >
                Batal
              </button>
            </div>
          </dialog>
        </>
      )}
      {importing &&
        (manage ? (
          <div className="replacement-options">
            <SourceOptions
              activeRevisionId={revision}
              sheetsConfig={sheetsConfig}
            />
          </div>
        ) : (
          <ImportWizard
            management={{ operation: "update", revision }}
            sheets={
              googleSource
                ? { config: sheetsConfig, existing: googleSource }
                : undefined
            }
            close={() => setImporting(false)}
          />
        ))}
    </>
  );
}
