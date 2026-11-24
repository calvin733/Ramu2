"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { formatNumber } from "@/domain/sales";
import { targetDate, type TargetActionState } from "@/domain/target-input";
import { targetKinds, type ManagedTarget } from "@/domain/targets";

export type TargetAction = (
  state: TargetActionState,
  form: FormData,
) => Promise<TargetActionState>;
type FormField = NonNullable<TargetActionState["field"]>;
type Saved = (result: NonNullable<TargetActionState["saved"]>) => void;

function useTargetAction(action: TargetAction, onSaved?: Saved) {
  return useActionState(async (state: TargetActionState, form: FormData) => {
    if (!onSaved) return action(state, form);
    try {
      const result = await action(state, form);
      if (result.saved) onSaved(result.saved);
      return result;
    } catch {
      return {
        error:
          "Perubahan belum dapat dikonfirmasi. Periksa koneksi dan coba lagi.",
      };
    }
  }, {});
}

function TargetAddress({ id, version }: { id: string; version?: number }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version ?? ""} />
    </>
  );
}

export function TargetOperation({
  target,
  action,
  operation,
  onSaved,
}: {
  target: ManagedTarget;
  action: TargetAction;
  operation: "primary" | "delete";
  onSaved?: Saved;
}) {
  const [result, submit, pending] = useTargetAction(action, onSaved);
  return (
    <form action={submit} className="target-operation">
      <TargetAddress id={target.id} version={target.version} />
      <input type="hidden" name="operation" value={operation} />
      {onSaved && <input type="hidden" name="tampilan-editor" value="dialog" />}
      <button
        type="submit"
        className={
          "button " +
          (operation === "delete" ? "target-delete-button" : "quiet")
        }
        disabled={pending}
      >
        {pending
          ? "Menyimpan…"
          : operation === "delete"
            ? "Hapus target ini"
            : "Jadikan utama"}
      </button>
      {result.error && (
        <p className="form-message" role="alert">
          {result.error}
        </p>
      )}
    </form>
  );
}

export function TargetForm({
  id,
  target,
  action,
  back,
  defaultPrimary = false,
  titleId,
  onCancel,
  onSaved,
}: {
  id: string;
  target?: ManagedTarget;
  action: TargetAction;
  back: string;
  defaultPrimary?: boolean;
  titleId?: string;
  onCancel?: () => void;
  onSaved?: Saved;
}) {
  const [result, submit, pending] = useTargetAction(action, onSaved);
  const initialDate = (date?: string) =>
    date?.split("-").reverse().join("/") ?? "";
  const [values, setValues] = useState({
    kind: target?.kind ?? "revenue",
    start: initialDate(target?.range.start),
    end: initialDate(target?.range.end),
    value: target ? formatNumber(target.value) : "",
    sellingDays: target?.sellingDays == null ? "" : String(target.sellingDays),
    primary: target?.primary ?? defaultPrimary,
  });
  const field = (name: FormField) => ({
    name,
    value: values[name],
    "aria-invalid": result.field === name ? (true as const) : undefined,
    "aria-describedby": result.field === name ? "target-form-error" : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => {
      const value = event.target.value;
      setValues((previous) => ({ ...previous, [name]: value }));
    },
  });

  return (
    <div className="target-form-panel">
      <h1 id={titleId}>{target ? "Ubah target" : "Buat target"}</h1>
      <form action={submit} className="target-form" aria-busy={pending}>
        <TargetAddress id={id} version={target?.version} />
        <input type="hidden" name="kembali" value={back} />
        {onSaved && (
          <input type="hidden" name="tampilan-editor" value="dialog" />
        )}
        <label className="target-field">
          Jenis target
          <select {...field("kind")}>
            {Object.entries(targetKinds).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="target-dates-field">
          <legend>Periode target</legend>
          <div className="target-date-inputs">
            {(
              [
                ["start", "Mulai"],
                ["end", "Selesai"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="target-field">
                {label}
                <span className="target-input-with-icon">
                  <input
                    {...field(name)}
                    placeholder="DD/MM/YYYY"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="off"
                  />
                  <CalendarDays size={16} aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
          <div
            className="target-period-presets"
            aria-label="Bantuan tanggal selesai"
          >
            {(["month", "year"] as const).map((kind) => (
              <button
                type="button"
                className="button quiet"
                key={kind}
                disabled={pending || !targetDate(values.start)}
                onClick={() => {
                  const start = targetDate(values.start)!;
                  const year = Number(start.slice(0, 4));
                  const month = Number(start.slice(5, 7));
                  const end = new Date(
                    Date.UTC(year, kind === "month" ? month : 12, 0),
                  )
                    .toISOString()
                    .slice(0, 10);
                  setValues({ ...values, end: initialDate(end) });
                }}
              >
                {kind === "month"
                  ? "Sampai akhir bulan mulai"
                  : "Sampai akhir tahun mulai"}
              </button>
            ))}
          </div>
          <p className="target-form-hint">
            Ketik DD/MM/YYYY atau delapan angka.
          </p>
        </fieldset>
        <label className="target-field">
          Nilai target
          <span className="target-addon-field">
            {values.kind !== "orders" && <span aria-hidden="true">Rp</span>}
            <input
              {...field("value")}
              placeholder="Masukkan angka"
              required
              inputMode="numeric"
              maxLength={24}
              autoComplete="off"
            />
            {values.kind === "orders" && <span>pesanan</span>}
          </span>
        </label>
        <label className="target-field">
          Sisa hari jual · Opsional
          <span className="target-addon-field">
            <input
              {...field("sellingDays")}
              inputMode="numeric"
              placeholder="Opsional"
              maxLength={6}
              autoComplete="off"
            />
            <span>hari</span>
          </span>
          <span className="target-form-hint">
            Dipakai untuk menghitung kebutuhan per hari jual.
          </span>
        </label>
        {(values.kind === "gross-profit" || values.kind === "net-profit") && (
          <p className="target-form-hint">
            {values.kind === "gross-profit"
              ? "Realisasi laba kotor memerlukan data HPP."
              : "Realisasi laba bersih memerlukan data HPP dan biaya usaha."}
          </p>
        )}
        <label className="target-check">
          <input
            type="checkbox"
            name="primary"
            checked={values.primary}
            onChange={(event) =>
              setValues({ ...values, primary: event.target.checked })
            }
          />
          Jadikan target utama
        </label>
        {result.error && (
          <p id="target-form-error" className="form-message" role="alert">
            {result.error}
          </p>
        )}
        <div className="target-form-actions">
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan target"}
          </button>
          {onCancel ? (
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="button quiet"
            >
              Batal
            </button>
          ) : (
            <Link href={back} className="button quiet">
              Batal
            </Link>
          )}
        </div>
      </form>
      {target && (
        <details className="target-delete">
          <summary>Hapus target</summary>
          <p>Target ini akan dihapus dari daftar dan riwayat.</p>
          <TargetOperation
            target={target}
            action={action}
            operation="delete"
            onSaved={onSaved}
          />
        </details>
      )}
    </div>
  );
}
