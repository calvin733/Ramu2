"use client";

import { useActionState } from "react";
import { savePeriodCost } from "@/app/(usaha)/sumber-data/biaya/actions";
import type { DateRange } from "@/domain/sales";

export function PeriodCostForm({ range }: { range?: DateRange }) {
  const [result, action, pending] = useActionState(savePeriodCost, {});
  return (
    <form
      action={action}
      className="target-form-panel target-form"
      aria-busy={pending}
    >
      <div className="target-date-inputs">
        <label className="target-field">
          Awal cakupan
          <input
            name="start"
            required
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            defaultValue={range?.start}
          />
        </label>
        <label className="target-field">
          Akhir cakupan
          <input
            name="end"
            required
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            defaultValue={range?.end}
          />
        </label>
      </div>
      <label className="target-field">
        Total HPP barang yang terjual (Rp)
        <input name="hpp" inputMode="numeric" maxLength={24} />
      </label>
      <label className="target-field">
        Biaya usaha di luar HPP (Rp)
        <input name="expenses" inputMode="numeric" maxLength={24} />
      </label>
      <p className="target-form-hint">
        Isi 0 bila sudah dipastikan nol. Isian kosong berarti belum tercatat.
        Menyimpan rentang yang sama mengganti catatan biaya rentang tersebut.
      </p>
      {result.error && (
        <p role="alert" className="form-message">
          {result.error}
        </p>
      )}
      {result.saved && (
        <p role="status" className="form-message success">
          Biaya tersimpan.
        </p>
      )}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "Menyimpan biaya…" : "Simpan biaya"}
      </button>
    </form>
  );
}
