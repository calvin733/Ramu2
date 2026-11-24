import { cookies } from "next/headers";
import { demoTargetHistory, demoTargets } from "@/demo/fixture";
import { targetDate } from "@/domain/target-input";
import {
  daysBetween,
  isTargetKind,
  targetKinds,
  type ManagedTarget,
} from "@/domain/targets";

const demoTargetsCookie = "ramu-demo-targets";
export const demoTargetId = /^[\da-z-]{1,50}$/;

export async function readDemoTargets(): Promise<ManagedTarget[]> {
  const base = [...demoTargets, ...demoTargetHistory].map((target) => ({
    ...target,
    version: 1,
  }));
  const cookie = (await cookies()).get(demoTargetsCookie)?.value;
  if (!cookie) return base;
  try {
    const stored: unknown = JSON.parse(cookie);
    if (!Array.isArray(stored)) return base;
    const parsed: ManagedTarget[] = [];
    for (const item of stored) {
      if (!Array.isArray(item) || item.length !== 8) return base;
      const [id, kind, value, start, end, primary, sellingDays, version] = item;
      if (
        typeof id !== "string" ||
        !demoTargetId.test(id) ||
        typeof kind !== "string" ||
        !isTargetKind(kind) ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        typeof start !== "string" ||
        targetDate(start) !== start ||
        typeof end !== "string" ||
        targetDate(end) !== end ||
        end < start ||
        typeof primary !== "boolean" ||
        !Number.isSafeInteger(version) ||
        version < 1 ||
        (sellingDays !== null &&
          (!Number.isInteger(sellingDays) ||
            sellingDays < 0 ||
            sellingDays > daysBetween(start, end) + 1))
      )
        return base;
      if (
        parsed.some((target) => target.id === id || (target.primary && primary))
      )
        return base;
      parsed.push({
        id,
        kind,
        label: targetKinds[kind],
        value,
        range: { start, end },
        primary,
        sellingDays,
        version,
      });
    }
    return parsed;
  } catch {
    return base;
  }
}

export async function writeDemoTargets(targets: readonly ManagedTarget[]) {
  const data = JSON.stringify(
    targets.map((target) => [
      target.id,
      target.kind,
      target.value,
      target.range.start,
      target.range.end,
      Boolean(target.primary),
      target.sellingDays ?? null,
      target.version,
    ]),
  );
  if (encodeURIComponent(data).length > 3600)
    return "Ruang sesi demo penuh. Hapus target contoh sebelum menambah target lagi.";
  (await cookies()).set(demoTargetsCookie, data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/demo",
  });
  return null;
}
