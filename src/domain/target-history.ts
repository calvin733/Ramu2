import { targetDate } from "./target-input.ts";
import type { SearchParams } from "./sales.ts";

export function historyDates(params: SearchParams) {
  const from = typeof params.mulai === "string" ? params.mulai : "";
  const through = typeof params.sampai === "string" ? params.sampai : "";
  const invalid =
    (!!from && targetDate(from) !== from) ||
    (!!through && targetDate(through) !== through) ||
    (!!from && !!through && from > through);
  return { from, through, invalid };
}

export function targetReturn(value: unknown, home: string) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value) ||
    value.length > 1000
  )
    return home;
  const url = new URL(value, "https://ramu.invalid");
  return url.origin === "https://ramu.invalid" &&
    [home, home + "/riwayat"].includes(url.pathname)
    ? url.pathname + url.search
    : home;
}
