"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import {
  periodChoices,
  periodKey,
  periodLabel,
  periodParams,
  type DateRange,
  type Period,
} from "@/domain/sales";

export function PeriodControls({
  period,
  coverage,
  label = "Pilih periode Dashboard",
}: {
  period: Period;
  coverage: DateRange;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const options = periodChoices(period, coverage);

  function go(next: Period) {
    const query = periodParams(next);
    for (const key of ["revisi", "asal"]) {
      const value = search.get(key);
      if (value) query.set(key, value);
    }
    startTransition(() =>
      router.push(`${pathname}?${query}`, { scroll: false }),
    );
  }

  function switchView(kind: Period["kind"]) {
    if (kind === period.kind) return;
    if (kind === "year") go({ kind, year: period.year });
    else {
      const month =
        period.year === Number(coverage.end.slice(0, 4))
          ? Number(coverage.end.slice(5, 7))
          : 12;
      go({ kind, year: period.year, month });
    }
  }

  return (
    <div className="period-controls" aria-busy={pending}>
      <div className="segments" role="group" aria-label="Jenis periode">
        <button
          type="button"
          aria-pressed={period.kind === "month"}
          onClick={() => switchView("month")}
        >
          Bulanan
        </button>
        <button
          type="button"
          aria-pressed={period.kind === "year"}
          onClick={() => switchView("year")}
        >
          Tahunan
        </button>
      </div>
      <div className="period-select">
        <select
          aria-label={label}
          value={periodKey(period)}
          onChange={(event) => {
            const option = options.find(
              (item) => periodKey(item) === event.target.value,
            );
            if (option) go(option);
          }}
        >
          {options.map((option) => (
            <option key={periodKey(option)} value={periodKey(option)}>
              {periodLabel(option)}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      <span className="sr-only" role="status">
        {pending ? "Memuat periode…" : ""}
      </span>
    </div>
  );
}
