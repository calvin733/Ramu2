"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  activateImport,
  cancelImport,
  inspectImport,
  previewImport,
} from "@/app/sumber-impor/actions";
import {
  maxFileBytes,
  type GoogleSheetRef,
  type ImportIssue,
  type ImportManagement,
  type ImportMapping,
  type ImportTab,
  type SheetsPickerConfig,
} from "@/domain/import-types";
import { formatNumber, formatRange, rupiah } from "@/domain/sales";
import "./import-wizard.css";
import type { ImportReading } from "@/server/import/assistant";
import {
  GoogleSheetsConnect,
  type GoogleAttempt,
} from "./google-sheets-connect";

const columnLabels = {
  date: "Tanggal transaksi · wajib",
  revenue: "Nilai penjualan · wajib",
  order: "ID pesanan · opsional",
  product: "Nama produk · opsional",
  status: "Status transaksi · opsional",
  quantity: "Jumlah unit · opsional",
} as const;

type Column = keyof typeof columnLabels;
type Step = "file" | "tab" | "mapping" | "preview";
type Preview = NonNullable<
  Awaited<ReturnType<typeof previewImport>>["preview"]
>;

const titles = {
  file: "Impor Excel atau CSV",
  tab: "Pilih tab penjualan",
  mapping: "Periksa cara membaca data",
  preview: "Periksa data penjualan",
};

export function ImportWizard({
  close,
  management,
  sheets,
  vendor,
}: {
  close: () => void;
  management?: ImportManagement;
  sheets?: { config: SheetsPickerConfig | null; existing?: GoogleSheetRef };
  vendor?: "Shopee" | "Moka";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheetInput, setSheetInput] = useState<GoogleAttempt | null>(null);
  const [headerKey, setHeaderKey] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [tab, setTab] = useState(0);
  const [tabs, setTabs] = useState<ImportTab[]>([]);
  const [suggestedTabs, setSuggestedTabs] = useState<number[]>([]);
  const [tabSearch, setTabSearch] = useState("");
  const [columns, setColumns] = useState<{ label: string; sample: string }[]>(
    [],
  );
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [sampleRows, setSampleRows] = useState<
    { number: number; cells: string[] }[]
  >([]);
  const [basisChosen, setBasisChosen] = useState(false);
  const [dateChosen, setDateChosen] = useState(false);
  const [moneyChosen, setMoneyChosen] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [reading, setReading] = useState<ImportReading | null>(null);
  const [manual, setManual] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [dialogue, setDialogue] = useState<
    { role: "assistant" | "user"; text: string }[]
  >([]);
  const [showAllChoices, setShowAllChoices] = useState(false);
  const [correction, setCorrection] =
    useState<Awaited<ReturnType<typeof previewImport>>["correction"]>(
      undefined,
    );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [coverage, setCoverage] = useState({ from: "", through: "" });
  const [acceptReduced, setAcceptReduced] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const input = sheets ? sheetInput : file;
  const canSwitchTab = tabs.length > 1 && !sheets?.existing;

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => heading.current?.focus(), [step]);

  function run(action: () => Promise<void>) {
    setError("");
    setIssues([]);
    setCorrection(undefined);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("Permintaan belum berhasil. Periksa koneksi dan coba lagi.");
      }
    });
  }

  function sourceForm(selected: File | GoogleAttempt, selectedTab?: number) {
    const form = new FormData();
    if (selected instanceof File) form.set("file", selected);
    else {
      form.set("kind", "google_sheets");
      form.set("spreadsheet", selected.spreadsheetId);
      form.set("accessToken", selected.accessToken);
    }
    if (selectedTab !== undefined) form.set("sheet", String(selectedTab));
    return form;
  }

  function showError(result: { error: string; reconnect?: boolean }) {
    setError(result.error);
    if (result.reconnect) {
      setSheetInput(null);
      setReconnect(true);
      setStep("file");
    }
  }

  function inspect(
    selected: File | GoogleAttempt | null,
    selectedTab?: number,
    reply?: { ticket: string; choice?: number; text?: string },
  ) {
    if (!selected) {
      setError("Pilih file penjualan untuk melanjutkan.");
      return;
    }
    if (selected instanceof File && selected.size > maxFileBytes) {
      setError("Ukuran file maksimal 2 MB.");
      return;
    }
    run(async () => {
      if (!reply) {
        setReading(null);
        setManual(false);
        setDialogue([]);
      }
      const result = await inspectImport(
        sourceForm(selected, selectedTab),
        management,
        reply,
      );
      if (result.error) {
        showError({ error: result.error, reconnect: result.reconnect });
        return;
      }
      const nextTabs = result.tabs ?? [];
      if (!(selected instanceof File)) {
        setSheetInput(selected);
        setReconnect(false);
      }
      setTabs(nextTabs);
      setSuggestedTabs(result.suggestedTabs ?? []);
      if (result.columns && result.mapping) {
        setColumns(result.columns);
        setSampleRows(result.sampleRows);
        setMapping(result.mapping);
        setHeaderKey(result.headerKey);
        setBasisChosen(result.guidance.basisConfirmed);
        setDateChosen(result.guidance.dateConfirmed);
        setMoneyChosen(result.guidance.moneyConfirmed);
        setGuidance(result.guidance.message);
        setReading(result.reading);
        setManual(false);
        setReplyText("");
        setShowAllChoices(false);
        setDialogue((current) =>
          [
            ...current,
            {
              role: "assistant" as const,
              text: result.reading.question?.text ?? result.reading.summary,
            },
          ].slice(-8),
        );
        setTab(result.sheet);
        setCoverage({ from: "", through: "" });
        setStep("mapping");
        if (!result.reading.question) {
          await loadPreview(
            selected,
            result.sheet,
            result.mapping,
            { from: "", through: "" },
            result.headerKey,
          );
        }
      } else {
        setTab(nextTabs[0]?.id ?? 0);
        setStep("tab");
      }
    });
  }

  async function loadPreview(
    selected: File | GoogleAttempt,
    selectedTab: number,
    selectedMapping: ImportMapping,
    selectedCoverage: { from: string; through: string },
    selectedHeaderKey: string,
  ) {
    const form = sourceForm(selected, selectedTab);
    if (sheets) form.set("headerKey", selectedHeaderKey);
    const result = await previewImport(
      form,
      selectedMapping,
      selectedCoverage,
      management,
    );
    if (result.error)
      showError({ error: result.error, reconnect: result.reconnect });
    if (result.issues) {
      setError(
        result.correction
          ? "Cara membaca nilai penjualan perlu disesuaikan."
          : `Periksa ${formatNumber(result.issueCount)} baris bermasalah sebelum melanjutkan.`,
      );
      setIssues(result.issues);
      setCorrection(result.correction);
      setStep("mapping");
    }
    if (result.preview) {
      const next = result.preview;
      if (preview) {
        const previous = await cancelImport(preview.id);
        if (previous.error) {
          setError(previous.error);
          return;
        }
      }
      setPreview(next);
      setCoverage({ from: next.from, through: next.through });
      setAcceptReduced(false);
      setStep("preview");
    }
  }

  function answerQuestion(choice?: number) {
    if (!reading?.ticket || !reading.question || !input || pending) return;
    const text =
      choice === undefined
        ? replyText.trim()
        : reading.question.choices[choice]?.label;
    if (!text) return;
    setDialogue((current) =>
      [...current, { role: "user" as const, text }].slice(-8),
    );
    inspect(input, tab, {
      ticket: reading.ticket,
      ...(choice === undefined ? { text } : { choice }),
    });
  }

  function review(override?: ImportMapping) {
    const selectedMapping = override ?? mapping;
    if (!input || !selectedMapping) return;
    if (!override && !basisChosen) {
      setError("Pilih dasar nilai penjualan.");
      return;
    }
    if (!override && (!dateChosen || !moneyChosen)) {
      setError("Pilih format tanggal dan angka yang sesuai dengan sumber.");
      return;
    }
    if (override) {
      setMapping(override);
      setBasisChosen(true);
      setDateChosen(true);
      setMoneyChosen(true);
    }
    run(async () => {
      await loadPreview(input, tab, selectedMapping, coverage, headerKey);
    });
  }

  function changeStep(next?: Step) {
    if (pending) return;
    run(async () => {
      if (preview) {
        const result = await cancelImport(preview.id);
        if (result.error) {
          setError(result.error);
          return;
        }
        setPreview(null);
      }
      if (next) setStep(next);
      else close();
      if (next === "file") {
        setFile(null);
        setSheetInput(null);
      }
      if (next === "mapping") setCoverage({ from: "", through: "" });
    });
  }

  function activate() {
    if (!preview) return;
    run(async () => {
      const result = await activateImport(preview.id, acceptReduced);
      if (result.error) {
        setError(result.error);
        return;
      }
      close();
      const query = new URLSearchParams({ impor: "sukses" });
      for (const key of ["tampilan", "periode"]) {
        const value = search.get(key);
        if (value && value.length <= 10) query.set(key, value);
      }
      router.push(`/dashboard?${query}`);
    });
  }

  function setField<Key extends keyof ImportMapping>(
    field: Key,
    value: ImportMapping[Key],
  ) {
    setMapping((current) => current && { ...current, [field]: value });
    setError("");
    setIssues([]);
    setCorrection(undefined);
    if (field === "revenue") {
      setBasisChosen(false);
      setMoneyChosen(false);
    }
  }

  const range = (from: string, through: string) =>
    formatRange({ start: from, end: through }, true);
  const coverageEdited =
    preview &&
    (preview.from !== coverage.from || preview.through !== coverage.through);

  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        event.preventDefault();
        changeStep();
      }}
    >
      <div className="import-content" aria-busy={pending}>
        <h2 id="import-title" ref={heading} tabIndex={-1}>
          {step !== "file"
            ? titles[step]
            : sheets
              ? sheets.existing
                ? "Perbarui Google Sheets"
                : "Hubungkan Google Sheets"
              : vendor
                ? "Impor laporan " + vendor
                : management
                  ? management.operation === "update"
                    ? "Perbarui data penjualan"
                    : "Ganti sumber penjualan"
                  : titles.file}
        </h2>
        {pending && (
          <p className="import-status" role="status">
            {step === "file" || step === "tab" || step === "mapping"
              ? "Saya sedang memahami struktur data Anda…"
              : management?.operation === "update"
                ? "Memproses pembaruan…"
                : "Memproses permintaan…"}
          </p>
        )}
        {error && (
          <div className="form-message" role="alert">
            <p>{error}</p>
            {correction && (
              <div className="import-correction">
                <p>{correction.message}</p>
                <button
                  type="button"
                  className="button primary"
                  disabled={pending}
                  onClick={() => review(correction.mapping)}
                >
                  {correction.label}
                </button>
              </div>
            )}
            {management && (
              <p>
                Ringkasan tetap memakai data terakhir yang berhasil diaktifkan.
              </p>
            )}
            {issues.length > 0 && (
              <details open={!correction}>
                <summary>Lihat baris yang perlu diperiksa</summary>
                <ul>
                  {issues.map((issue, index) => (
                    <li key={index}>
                      Baris {issue.row} · {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {step === "file" &&
          sheets &&
          (sheets.config ? (
            <GoogleSheetsConnect
              config={sheets.config}
              existing={sheets.existing}
              reconnect={reconnect}
              disabled={pending}
              onSelect={inspect}
              onPickerVisibility={(visible) => {
                const element = dialog.current;
                if (visible) element?.close();
                else if (element?.isConnected && !element.open) {
                  element.showModal();
                  heading.current?.focus();
                }
              }}
            />
          ) : (
            <p className="form-message">
              Koneksi Google Sheets sedang disiapkan. Anda dapat mengunduh
              spreadsheet sebagai Excel atau CSV lalu mengimpornya.
            </p>
          ))}
        {step === "file" && !sheets && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              inspect(file);
            }}
          >
            <p>
              Berikan file penjualan Anda. RAMU akan memahami kolomnya dan hanya
              menanyakan hal yang belum jelas.
            </p>
            <p className="import-data-notice">
              Judul kolom dan pola tipe data digunakan Gemini untuk memahami
              struktur. Isi transaksi dan identitas pelanggan tidak dikirim ke
              Gemini.
            </p>
            <a href="/template-penjualan.csv" download>
              Unduh template penjualan CSV
            </a>
            {management && (
              <p>
                Dashboard tetap memakai data terakhir sampai Anda mengonfirmasi
                file baru.
              </p>
            )}
            <p className="mapping-field">
              Format .xlsx atau .csv, maksimal 2 MB dan 5.000 baris. Siapkan
              kolom tanggal dan nilai transaksi. ID pesanan membantu menghitung
              jumlah pesanan.
            </p>
            <label>
              File penjualan
              <input
                type="file"
                accept=".csv,.xlsx"
                required
                disabled={pending}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="button primary" disabled={pending}>
              Periksa file
            </button>
          </form>
        )}
        {step === "tab" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              inspect(input, tab);
            }}
          >
            <p>
              Saya menemukan beberapa tab yang bisa dibaca. Pilih data penjualan
              yang ingin dihubungkan.
            </p>
            {suggestedTabs.length > 0 && (
              <div className="import-tab-suggestions">
                {suggestedTabs.map((id) => {
                  const option = tabs.find((tab) => tab.id === id);
                  return (
                    option && (
                      <button
                        key={id}
                        type="button"
                        className="button outline"
                        disabled={pending}
                        onClick={() => inspect(input, id)}
                      >
                        {option.name}
                      </button>
                    )
                  );
                })}
              </div>
            )}
            <label>
              Cari tab lain
              <input
                type="search"
                value={tabSearch}
                onChange={(event) => setTabSearch(event.target.value)}
                placeholder="Ketik nama tab"
              />
            </label>
            <label>
              Tab penjualan
              <select
                value={tab}
                onChange={(event) => setTab(Number(event.target.value))}
              >
                {tabs
                  .filter(
                    (option) =>
                      option.id === tab ||
                      option.name
                        .toLowerCase()
                        .includes(tabSearch.toLowerCase()),
                  )
                  .map(({ name, id }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button primary" disabled={pending}>
              Baca data
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={pending}
              onClick={() => changeStep("file")}
            >
              {sheets ? "Pilih spreadsheet lain" : "Pilih file lain"}
            </button>
          </form>
        )}
        {step === "mapping" && reading && !manual && (
          <section
            className="import-assistant"
            aria-label="Percakapan untuk memahami data"
          >
            <p className="import-assistant-label">
              {reading.provider === "gemini"
                ? "Dibantu Gemini"
                : reading.provider === "saved"
                  ? "Pemahaman sumber tersimpan"
                  : "Asisten penghubung data"}
            </p>
            {reading.notice && (
              <p className="import-data-notice" role="status">
                {reading.notice}
              </p>
            )}
            <div
              className="import-dialogue"
              aria-live="polite"
              aria-relevant="additions"
            >
              {dialogue.map((message, index) => (
                <p
                  key={index}
                  className={
                    message.role === "user" ? "import-reply" : "import-question"
                  }
                >
                  {message.text}
                </p>
              ))}
            </div>
            {reading.question ? (
              <>
                <div className="import-answer-choices">
                  {reading.question.choices
                    .slice(0, showAllChoices ? undefined : 4)
                    .map((choice, index) => (
                      <button
                        key={index}
                        type="button"
                        className="button outline"
                        disabled={pending}
                        onClick={() => answerQuestion(index)}
                      >
                        {choice.label}
                      </button>
                    ))}
                </div>
                {!showAllChoices && reading.question.choices.length > 4 && (
                  <button
                    type="button"
                    className="button quiet"
                    disabled={pending}
                    onClick={() => setShowAllChoices(true)}
                  >
                    Lihat pilihan lain
                  </button>
                )}
                <form
                  className="import-answer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    answerQuestion();
                  }}
                >
                  <label htmlFor="import-reply-text">
                    Atau jelaskan dengan kata-kata Anda
                  </label>
                  <textarea
                    id="import-reply-text"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={400}
                    rows={2}
                    disabled={pending}
                    placeholder="Misalnya: yang dimaksud jumlah adalah jumlah barang, bukan pesanan"
                  />
                  <button
                    className="button primary"
                    disabled={pending || !replyText.trim()}
                  >
                    Kirim jawaban
                  </button>
                </form>
              </>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={pending}
                onClick={() => review()}
              >
                Periksa ringkasan data
              </button>
            )}
            <button
              type="button"
              className="button quiet"
              disabled={pending}
              onClick={() => setManual(true)}
            >
              Lihat detail pembacaan
            </button>
          </section>
        )}
        {step === "mapping" && mapping && (!reading || manual) && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              review();
            }}
          >
            <p className="import-guidance">{guidance}</p>
            <dl className="import-detected-columns">
              {(Object.keys(columnLabels) as Column[])
                .filter((field) => mapping[field] >= 0)
                .map((field) => (
                  <div key={field}>
                    <dt>{columnLabels[field].split(" · ")[0]}</dt>
                    <dd>{columns[mapping[field]]?.label}</dd>
                  </div>
                ))}
            </dl>
            <details
              className="import-mapping-settings"
              open={
                !basisChosen ||
                !dateChosen ||
                !moneyChosen ||
                mapping.date < 0 ||
                mapping.revenue < 0 ||
                mapping.status < 0
              }
            >
              <summary>Sesuaikan kolom dan format</summary>
              {sampleRows.length > 0 && (
                <details>
                  <summary>Lihat contoh baris sumber</summary>
                  <div
                    className="sales-table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Contoh baris sumber penjualan"
                  >
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Baris</th>
                          {columns.map((column, index) => (
                            <th scope="col" key={index}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.map((row) => (
                          <tr key={row.number}>
                            <th scope="row">{row.number}</th>
                            {row.cells.map((cell, index) => (
                              <td key={index}>{cell || "–"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <p>
                Kolom yang dikenali sudah terisi. Ubah pilihan hanya jika belum
                sesuai dengan sumber Anda.
              </p>
              {(Object.keys(columnLabels) as Column[]).map((field) => (
                <label key={field} className="mapping-field">
                  {columnLabels[field]}
                  <select
                    value={mapping[field]}
                    onChange={(event) =>
                      setField(field, Number(event.target.value))
                    }
                  >
                    <option value={-1}>
                      {field === "date" || field === "revenue"
                        ? "Pilih kolom"
                        : "Tanpa kolom"}
                    </option>
                    {columns.map(({ label }, index) => (
                      <option key={index} value={index}>
                        {label} ({index + 1})
                      </option>
                    ))}
                  </select>
                  {columns[mapping[field]]?.sample && (
                    <small>Contoh {columns[mapping[field]].sample}</small>
                  )}
                </label>
              ))}
              <label>
                Nilai pada kolom penjualan adalah
                <select
                  required
                  value={basisChosen ? mapping.basis : ""}
                  onChange={(event) => {
                    setBasisChosen(Boolean(event.target.value));
                    if (event.target.value)
                      setField(
                        "basis",
                        event.target.value as ImportMapping["basis"],
                      );
                  }}
                >
                  <option value="">Pilih arti nilai pada sumber</option>
                  <option value="line">Nilai barang pada setiap baris</option>
                  <option value="order">
                    Total seluruh pesanan, diulang pada setiap item
                  </option>
                  <option value="unit">
                    Harga satu barang, belum dikalikan jumlah
                  </option>
                </select>
                <small>
                  {mapping.basis === "line"
                    ? "Nilai tiap baris dijumlahkan. ID pesanan yang sama tetap dihitung sebagai satu pesanan."
                    : mapping.basis === "order"
                      ? "Total pesanan yang diulang dihitung satu kali. Nilainya harus sama untuk semua item pesanan tersebut."
                      : "RAMU mengalikan harga satu barang dengan jumlah unit pada baris tersebut."}
                </small>
              </label>
              <label>
                Urutan tanggal
                <select
                  required
                  value={dateChosen ? mapping.dateFormat : ""}
                  onChange={(event) => {
                    setDateChosen(Boolean(event.target.value));
                    if (event.target.value)
                      setField(
                        "dateFormat",
                        event.target.value as ImportMapping["dateFormat"],
                      );
                  }}
                >
                  <option value="">Pilih urutan tanggal</option>
                  <option value="iso">Tahun–bulan–hari (2026-11-17)</option>
                  <option value="dmy">Hari–bulan–tahun (17/11/2026)</option>
                  <option value="mdy">Bulan–hari–tahun (11/17/2026)</option>
                </select>
              </label>
              <label>
                Pemisah angka
                <select
                  required
                  value={moneyChosen ? mapping.moneyFormat : ""}
                  onChange={(event) => {
                    setMoneyChosen(Boolean(event.target.value));
                    if (event.target.value)
                      setField(
                        "moneyFormat",
                        event.target.value as ImportMapping["moneyFormat"],
                      );
                  }}
                >
                  <option value="">Pilih format angka</option>
                  <option value="id">Indonesia (12.000,00)</option>
                  <option value="en">Internasional (12,000.00)</option>
                </select>
              </label>
              {mapping.status < 0 && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={mapping.validOnly}
                    onChange={(event) =>
                      setField("validOnly", event.target.checked)
                    }
                  />
                  <span>
                    Sumber hanya memuat transaksi sah dan retur. Nilai negatif
                    dihitung sebagai retur.
                  </span>
                </label>
              )}
              {mapping.order >= 0 &&
                basisChosen &&
                mapping.basis !== "order" && (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={mapping.multiItem}
                      onChange={(event) =>
                        setField("multiItem", event.target.checked)
                      }
                    />
                    <span>
                      ID pesanan yang berulang menandakan beberapa item dalam
                      satu pesanan.
                    </span>
                  </label>
                )}
            </details>
            <button className="button primary" disabled={pending}>
              Lihat pratinjau
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={pending}
              onClick={() => changeStep(canSwitchTab ? "tab" : "file")}
            >
              Kembali
            </button>
          </form>
        )}
        {step === "preview" && preview && (
          <div className="preview-import-details">
            <strong>{preview.name}</strong>
            <p className="import-guidance">
              {reading
                ? reading.summary
                : mapping?.basis === "line"
                  ? "Nilai setiap baris dijumlahkan. Satu ID pesanan tetap dihitung sebagai satu pesanan."
                  : mapping?.basis === "order"
                    ? "Total pesanan yang diulang pada beberapa item dihitung satu kali."
                    : "Harga satu barang dikalikan jumlah unit pada setiap baris."}
            </p>
            <div>
              <p>
                {range(preview.from, preview.through)} ·{" "}
                {preview.orders === null
                  ? "Pesanan belum tersedia"
                  : `${formatNumber(preview.orders)} pesanan`}
              </p>
              <p>
                Total penjualan <strong>{rupiah(preview.sales)}</strong>
              </p>
              <p>
                {formatNumber(preview.rows)} baris valid
                {preview.skipped > 0 &&
                  ` · ${formatNumber(preview.skipped)} baris batal atau belum selesai dikecualikan`}
              </p>
            </div>
            <p className="preview-instruction">
              Tinjau tanggal dan nilai penjualan sebelum mengaktifkan sumber.{" "}
              {preview.orders === null &&
                "ID pesanan belum memadai untuk menghitung pesanan. "}
              {!preview.products &&
                "Rincian produk memerlukan nama produk dan nilai per item."}
            </p>
            {preview.previousCoverage && (
              <div className="form-message">
                <p>
                  Sumber aktif mencakup{" "}
                  {range(
                    preview.previousCoverage.from,
                    preview.previousCoverage.through,
                  )}
                  . Sebagian periode akan hilang dari sumber aktif.
                </p>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={acceptReduced}
                    onChange={(event) => setAcceptReduced(event.target.checked)}
                  />
                  <span>Saya setuju mengganti sumber dengan cakupan ini.</span>
                </label>
              </div>
            )}
            <details className="coverage-details">
              <summary>Sesuaikan cakupan data</summary>
              <p>
                Perluas cakupan jika laporan juga mencakup hari tanpa transaksi.
              </p>
              <div className="form-pair">
                <label>
                  Dari
                  <input
                    type="date"
                    value={coverage.from}
                    max={preview.dataFrom}
                    onChange={(event) =>
                      setCoverage({ ...coverage, from: event.target.value })
                    }
                  />
                </label>
                <label>
                  Sampai
                  <input
                    type="date"
                    value={coverage.through}
                    min={preview.dataThrough}
                    onChange={(event) =>
                      setCoverage({ ...coverage, through: event.target.value })
                    }
                  />
                </label>
              </div>
              {coverageEdited && (
                <button
                  type="button"
                  className="button outline"
                  disabled={pending || !coverage.from || !coverage.through}
                  onClick={() => review()}
                >
                  Perbarui pratinjau
                </button>
              )}
            </details>
            <button
              type="button"
              className="button primary"
              disabled={
                pending ||
                Boolean(coverageEdited) ||
                Boolean(preview.previousCoverage && !acceptReduced)
              }
              onClick={activate}
            >
              {management?.operation === "update"
                ? "Konfirmasi pembaruan"
                : "Gunakan sumber ini"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={pending}
              onClick={() => changeStep("mapping")}
            >
              Sesuaikan cara membaca data
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={pending}
              onClick={() => changeStep("file")}
            >
              {sheets
                ? sheets.existing
                  ? "Pilih ulang akun Google"
                  : "Pilih spreadsheet lain"
                : "Pilih file lain"}
            </button>
          </div>
        )}
        <button
          type="button"
          className="button quiet"
          disabled={pending}
          onClick={() => changeStep()}
        >
          Batal
        </button>
      </div>
    </dialog>
  );
}
