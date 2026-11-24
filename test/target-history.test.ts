import assert from "node:assert/strict";
import test from "node:test";
import { historyDates, targetReturn } from "../src/domain/target-history.ts";

test("history range accepts open bounds and rejects invalid calendars or reversed bounds", () => {
  assert.equal(
    historyDates({ mulai: "2024-02-29", sampai: "2026-12-31" }).invalid,
    false,
  );
  assert.equal(historyDates({ sampai: "2026-12-31" }).invalid, false);
  assert.equal(historyDates({ mulai: "2026-02-29" }).invalid, true);
  assert.equal(
    historyDates({ mulai: "2026-12-31", sampai: "2026-01-01" }).invalid,
    true,
  );
});

test("return from target editor retains filters inside the same target area only", () => {
  for (const home of ["/target-bisnis", "/demo/target-bisnis"]) {
    const destination =
      home + "/riwayat?jenis=orders&mulai=2026-01-01&urut=lowest";
    assert.equal(targetReturn(destination, home), destination);
    for (const unsafe of [
      "//evil.test",
      "https://evil.test",
      "/asisten",
      "/target-bisnis/../../masuk",
      "/target-bisnis\\@evil.test",
      "/target-bisnis\n",
    ])
      assert.equal(targetReturn(unsafe, home), home);
  }
});
