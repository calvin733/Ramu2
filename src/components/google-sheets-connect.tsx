"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { GoogleSheetRef, SheetsPickerConfig } from "@/domain/import-types";

const scope = "https://www.googleapis.com/auth/drive.file";
type TokenResponse = { access_token?: string; scope?: string; error?: string };
type PickerResponse = { action: string; docs?: { id?: string }[] };
type PickerDialog = { setVisible(visible: boolean): void };
type View = { setMimeTypes(type: string): View; setMode(mode: string): View };
type Builder = {
  addView(view: View): Builder;
  setOAuthToken(token: string): Builder;
  setDeveloperKey(key: string): Builder;
  setAppId(id: string): Builder;
  setOrigin(origin: string): Builder;
  setLocale(locale: string): Builder;
  setCallback(callback: (response: PickerResponse) => void): Builder;
  build(): PickerDialog;
};
type GoogleWindow = Window & {
  gapi?: {
    load(
      name: string,
      callbacks: {
        callback(): void;
        onerror(): void;
        timeout: number;
        ontimeout(): void;
      },
    ): void;
  };
  google?: {
    accounts?: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          include_granted_scopes: boolean;
          callback: (response: TokenResponse) => void;
          error_callback: (error: { type?: string }) => void;
        }): { requestAccessToken(options: { prompt: string }): void };
      };
    };
    picker?: {
      DocsView: new (viewId: string) => View;
      ViewId: { SPREADSHEETS: string };
      DocsViewMode: { LIST: string };
      Action: { PICKED: string; CANCEL: string };
      PickerBuilder: new () => Builder;
    };
  };
};

export type GoogleAttempt = { spreadsheetId: string; accessToken: string };

export function GoogleSheetsConnect({
  config,
  existing,
  reconnect,
  disabled,
  onSelect,
  onPickerVisibility,
}: {
  config: SheetsPickerConfig;
  existing?: GoogleSheetRef;
  reconnect: boolean;
  disabled: boolean;
  onSelect: (input: GoogleAttempt, tab?: number) => void;
  onPickerVisibility: (visible: boolean) => void;
}) {
  const [identityReady, setIdentityReady] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState("");
  const pickerDialog = useRef<PickerDialog | null>(null);
  const currentAttempt = useRef(0);
  const shouldPick = !existing || reconnect;
  useEffect(
    () => () => {
      currentAttempt.current++;
      pickerDialog.current?.setVisible(false);
    },
    [],
  );

  function scriptError() {
    setError(
      "Layanan Google belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.",
    );
  }

  function authorize() {
    const { google } = window as GoogleWindow;
    const identity = google?.accounts?.oauth2;
    if (!identity) {
      scriptError();
      return;
    }
    const attempt = ++currentAttempt.current;
    setError("");
    setAuthorizing(true);
    const recover = (message: string) => {
      if (currentAttempt.current !== attempt) return;
      setAuthorizing(false);
      setError(message);
    };
    try {
      const tokenClient = identity.initTokenClient({
        client_id: config.clientId,
        scope,
        include_granted_scopes: false,
        error_callback: ({ type }) =>
          recover(
            type === "popup_failed_to_open"
              ? "Izinkan pop-up Google di browser lalu coba lagi."
              : "Izin Google belum diberikan. Coba lagi untuk menghubungkan.",
          ),
        callback: (response) => {
          if (currentAttempt.current !== attempt) return;
          const accessToken = response.access_token;
          if (
            response.error ||
            !accessToken ||
            !response.scope?.split(" ").includes(scope)
          ) {
            recover(
              "Izin untuk memilih spreadsheet belum diberikan. Coba lagi.",
            );
            return;
          }
          if (existing && !reconnect) {
            setAuthorizing(false);
            onSelect(
              { spreadsheetId: existing.spreadsheetId, accessToken },
              existing.sheetId,
            );
            return;
          }
          const picker = google.picker;
          if (!picker) {
            recover("Pemilih spreadsheet belum siap. Coba lagi.");
            return;
          }
          try {
            const view = new picker.DocsView(picker.ViewId.SPREADSHEETS)
              .setMimeTypes("application/vnd.google-apps.spreadsheet")
              .setMode(picker.DocsViewMode.LIST);
            pickerDialog.current = new picker.PickerBuilder()
              .setAppId(config.projectNumber)
              .setDeveloperKey(config.developerKey)
              .setOAuthToken(accessToken)
              .setOrigin(window.location.origin)
              .setLocale("id")
              .addView(view)
              .setCallback(({ action, docs }) => {
                if (
                  currentAttempt.current !== attempt ||
                  (action !== picker.Action.PICKED &&
                    action !== picker.Action.CANCEL)
                )
                  return;
                pickerDialog.current = null;
                onPickerVisibility(false);
                setAuthorizing(false);
                if (action === picker.Action.CANCEL) return;
                const id = docs?.[0]?.id;
                if (!id || (existing && id !== existing.spreadsheetId)) {
                  setError(
                    existing
                      ? "Pilih spreadsheet yang sama dengan sumber aktif."
                      : "Pilih spreadsheet yang berisi data penjualan.",
                  );
                  return;
                }
                onSelect({ spreadsheetId: id, accessToken }, existing?.sheetId);
              })
              .build();
            // Picker's dialog is outside our native dialog and needs focus.
            onPickerVisibility(true);
            pickerDialog.current.setVisible(true);
          } catch {
            onPickerVisibility(false);
            recover("Pemilih spreadsheet belum dapat dibuka. Coba lagi.");
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch {
      recover("Izin Google belum dapat dibuka. Coba lagi.");
    }
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setIdentityReady(true)}
        onError={scriptError}
      />
      {shouldPick && (
        <Script
          src="https://apis.google.com/js/api.js"
          strategy="afterInteractive"
          onReady={() => {
            const { gapi } = window as GoogleWindow;
            if (!gapi) {
              scriptError();
              return;
            }
            gapi.load("picker", {
              callback: () => setPickerReady(true),
              onerror: scriptError,
              ontimeout: scriptError,
              timeout: 10_000,
            });
          }}
          onError={scriptError}
        />
      )}
      <p>
        {existing
          ? "Gunakan akun Google yang bisa membuka spreadsheet sumber. RAMU membaca ulang tab yang sama untuk membuat pratinjau."
          : "Pilih spreadsheet penjualan melalui Google. Berikan izin pada file pilihan agar RAMU bisa membaca tab yang Anda pilih."}
      </p>
      <p className="import-data-notice">
        RAMU memahami judul kolom dan pola tipe data dengan Gemini. Isi
        transaksi dan identitas pelanggan tetap diproses di RAMU.
      </p>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      {authorizing && <p role="status">Lanjutkan di jendela Google.</p>}
      <button
        type="button"
        className="button primary"
        disabled={
          disabled ||
          authorizing ||
          !identityReady ||
          (shouldPick && !pickerReady)
        }
        onClick={authorize}
      >
        {reconnect
          ? "Hubungkan ulang"
          : existing
            ? "Baca spreadsheet"
            : "Pilih spreadsheet"}
      </button>
    </>
  );
}
