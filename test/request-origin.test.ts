import assert from "node:assert/strict";
import test from "node:test";
import { sameOriginRequest } from "../src/server/request-origin.ts";

const request = (
  origin?: string,
  host?: string,
  extra: Record<string, string> = {},
  url = "http://127.0.0.1:3000/api/asisten",
) =>
  new Request(url, {
    method: "POST",
    headers: {
      ...(origin === undefined ? {} : { origin }),
      ...(host === undefined ? {} : { host }),
      ...extra,
    },
  });

test("chat accepts the browser host when Next uses a different internal hostname", () => {
  for (const configured of [
    undefined,
    "",
    "http://localhost:3000",
    "invalid url",
  ]) {
    assert.equal(
      sameOriginRequest(
        request("http://localhost:3000", "localhost:3000"),
        configured,
      ),
      true,
    );
    assert.equal(
      sameOriginRequest(
        request("http://127.0.0.1:3000", "127.0.0.1:3000"),
        configured,
      ),
      true,
    );
    assert.equal(
      sameOriginRequest(
        request("http://localhost:3001", "localhost:3001"),
        configured,
      ),
      true,
    );
    assert.equal(
      sameOriginRequest(request("http://[::1]:3000", "[::1]:3000"), configured),
      true,
    );
  }
});

test("configured HTTPS origins work behind a proxy without trusting forwarded hosts", () => {
  assert.equal(
    sameOriginRequest(
      request("https://ramu.example", "internal:3000"),
      "https://ramu.example",
    ),
    true,
  );
  assert.equal(
    sameOriginRequest(
      request(
        "https://preview.ramu.example",
        "preview.ramu.example",
        {},
        "https://127.0.0.1:3000/api/asisten",
      ),
      "https://ramu.example",
    ),
    true,
  );
  assert.equal(
    sameOriginRequest(
      request(
        "https://evil.example",
        "ramu.example",
        { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
        "https://127.0.0.1/api/asisten",
      ),
      "https://ramu.example",
    ),
    false,
  );
});

test("foreign origins, malformed origins, other ports and unsafe host syntax are rejected", () => {
  for (const origin of [
    "https://evil.example",
    "http://localhost:3001",
    "http://localhost.attacker.test:3000",
    "null",
    "",
    "http://localhost:3000/path",
    "http://localhost:3000,http://evil.example",
    "file:///demo",
  ]) {
    assert.equal(
      sameOriginRequest(request(origin, "localhost:3000"), ""),
      false,
      origin,
    );
  }
  for (const host of [
    "",
    "localhost:3000@evil.example",
    "localhost:3000/path",
    "localhost:3000,evil.example",
    "localhost:3000#evil",
    "localhost:3000\\evil",
  ]) {
    assert.equal(
      sameOriginRequest(request("http://localhost:3000", host), ""),
      false,
      host,
    );
  }
  assert.equal(
    sameOriginRequest(request("http://127.0.0.1:3000", "localhost:3000"), ""),
    false,
    "do not accept an internal hostname when Host differs",
  );
});

test("requests without Origin remain supported, while browser cross-site attempts fail", () => {
  assert.equal(sameOriginRequest(request(), ""), true);
  assert.equal(sameOriginRequest(request("http://127.0.0.1:3000"), ""), true);
  assert.equal(
    sameOriginRequest(
      request(undefined, undefined, { "sec-fetch-site": "cross-site" }),
      "",
    ),
    false,
  );
  assert.equal(
    sameOriginRequest(
      request("http://localhost:3000", "localhost:3000", {
        "sec-fetch-site": "cross-site",
      }),
      "http://localhost:3000",
    ),
    false,
  );
});
