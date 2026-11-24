import assert from "node:assert/strict";
import test from "node:test";
import {
  demoChatSession,
  demoTurnReceipt,
  verifiedDemoHistory,
} from "../src/server/demo-chat-session.ts";
import {
  sensitiveChatInput,
  groundedChatInput,
  renderGroundedChat,
} from "../src/domain/chat-grounding.ts";
import { analyzeChat } from "../src/domain/chat-analysis.ts";
import { demoSalesReport } from "../src/demo/sales-report.ts";
const { period, report } = demoSalesReport({});
const answer = analyzeChat({
  question: "Bagaimana penjualan?",
  selection: { period },
  report,
  sourceHref: "/demo/sumber-data",
  evidenceHref: () => "/demo/harian",
});
const turn = { id: "synthetic-turn", question: "Bagaimana penjualan?", answer };

test("demo receipts bind the displayed pair to its session, thread, version and expiry", (t) => {
  const session = demoChatSession(
    new Request("http://localhost:3000/demo/asisten/percakapan"),
  );
  const receipt = demoTurnReceipt(session.id, "thread", turn, 1);
  assert.deepEqual(
    verifiedDemoHistory(session.id, "thread", [receipt])?.turns[0].answer,
    JSON.parse(JSON.stringify(answer)),
  );
  assert.equal(verifiedDemoHistory("other-session", "thread", [receipt]), null);
  assert.equal(
    verifiedDemoHistory(session.id, "other-thread", [receipt]),
    null,
  );
  assert.equal(
    verifiedDemoHistory(session.id, "thread", [{ question: "Account secret" }]),
    null,
  );
  assert.equal(
    verifiedDemoHistory(session.id, "thread", [receipt.slice(0, -1) + "!"]),
    null,
  );
  const cookie = session.cookie!.split(";")[0];
  assert.equal(
    demoChatSession(
      new Request("http://localhost:3000", { headers: { cookie } }),
    ).id,
    session.id,
  );
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 7_200_001);
  assert.equal(verifiedDemoHistory(session.id, "thread", [receipt]), null);
});

test("sensitive demo input is blocked before provider processing", () => {
  for (const text of [
    "Email buyer@example.com",
    "Nomor +6281234567890",
    "rekening 123456789",
    "api_key=AIzaSECRETKEY123456789",
    "data usaha asli saya",
    '{"private":"data"}',
  ])
    assert.equal(sensitiveChatInput(text), true, text);
  for (const text of [
    "Apa beda omzet dan laba?",
    "Bandingkan bulan lalu",
    "Tampilkan tiga produk",
    "Apa langkah pertama saya?",
  ])
    assert.equal(sensitiveChatInput(text), false, text);
});

test("natural value tokens check metric and entity and refuse contradictory directions", () => {
  const data = groundedChatInput({
    question: turn.question,
    answer,
    catalog: report!.products!.map((item) => item.name),
    memory: [{ question: "Halo", answer: "Mau bahas apa?" }],
  });
  assert.equal(data.payload.memory[0].answer, "Mau bahas apa?");
  const f = data.facts[0];
  const claim = {
    id: f.id,
    metric: f.metric,
    entity: f.entity,
    direction: "value",
  };
  assert.equal(
    renderGroundedChat(
      {
        paragraphs: [
          "Omzetnya " +
            "{{F1.value}}. Kita bisa membahas satu langkah berikutnya.",
        ],
        claims: [claim],
      },
      data,
    ),
    "Omzetnya " + f.value + ". Kita bisa membahas satu langkah berikutnya.",
  );
  assert.equal(
    renderGroundedChat(
      {
        paragraphs: ["{{F1.value}}"],
        claims: [{ ...claim, metric: "net-profit" }],
      },
      data,
    ),
    null,
  );
  assert.equal(
    renderGroundedChat(
      { paragraphs: ["Penjualan turun {{F1.value}}"], claims: [claim] },
      data,
    ),
    null,
  );
  assert.equal(
    renderGroundedChat(
      {
        paragraphs: ["{{F1.value}}"],
        claims: [{ ...claim, entity: "ITEM_999" }],
      },
      data,
    ),
    null,
  );
});
