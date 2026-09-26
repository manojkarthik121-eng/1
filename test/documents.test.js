// PDF upload + web search, in mock mode (no network, no API key).
import test from "node:test";
import assert from "node:assert/strict";

process.env.LUMINARY_MOCK = "1";
const { createApp } = await import("../server/index.js");
const { Store } = await import("../server/store.js");
const { extractSources } = await import("../server/claude.js");

const app = createApp(new Store(null));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => server.close());

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function upload(path, body = PDF, params = {}) {
  const res = await fetch(`${base}${path}?${new URLSearchParams({ filename: "notes.pdf", ...params })}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

async function json(path, method = "GET", body) {
  const res = await fetch(base + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text };
}

test("create a topic from a PDF, attach more, chat with sources, remove", async () => {
  const created = await upload("/topics/from-pdf", PDF, { name: "Cell biology" });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, "Cell biology");
  assert.equal(created.body.documents.length, 1);
  assert.equal(created.body.documents[0].name, "notes.pdf");
  const id = created.body.id;

  // name falls back to the file name
  const unnamed = await upload("/topics/from-pdf");
  assert.equal(unnamed.body.name, "notes");

  const added = await upload(`/topics/${id}/documents`);
  assert.equal(added.status, 201);

  const chat = await json(`/chat/${id}`, "POST", { message: "What's new in this field?", webSearch: true });
  assert.match(chat.body, /"type":"search"/);
  assert.match(chat.body, /"type":"sources"/);
  assert.match(chat.body, /"type":"document"/);
  const history = JSON.parse((await json(`/chat/${id}`)).body);
  assert.ok(history[1].sources.length >= 3);

  // web search can be turned off per message
  const offline = await json(`/chat/${id}`, "POST", { message: "Explain it", webSearch: false });
  assert.doesNotMatch(offline.body, /"type":"search"/);

  const regen = await json(`/topics/${id}/regenerate`, "POST");
  assert.equal(regen.status, 200);

  assert.equal((await json(`/topics/${id}/documents/${added.body.id}`, "DELETE")).status, 204);
  const topic = JSON.parse((await json(`/topics/${id}`)).body);
  assert.equal(topic.documents.length, 1);
});

test("rejects non-PDF uploads and enforces limits", async () => {
  assert.equal((await upload("/topics/from-pdf", Buffer.from("hello world"))).status, 400);
  const res = await fetch(`${base}/topics/from-pdf`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
  assert.equal(res.status, 400);
  const big = await upload("/topics/from-pdf", Buffer.concat([PDF, Buffer.alloc(33 * 1024 * 1024)]));
  assert.equal(big.status, 413);

  const topic = (await upload("/topics/from-pdf")).body;
  for (let i = 0; i < 4; i++) assert.equal((await upload(`/topics/${topic.id}/documents`)).status, 201);
  assert.equal((await upload(`/topics/${topic.id}/documents`)).status, 400);
});

test("extractSources dedupes citations and falls back to search results", () => {
  const cited = extractSources([
    { type: "text", text: "a", citations: [
      { type: "web_search_result_location", url: "https://a.com", title: "A" },
      { type: "web_search_result_location", url: "https://a.com", title: "A" },
      { type: "page_location", document_title: "Book", start_page_number: 3, end_page_number: 4 },
      { type: "page_location", document_title: "Book", start_page_number: 5, end_page_number: 8 },
    ] },
  ]);
  assert.deepEqual(cited, [
    { type: "web", url: "https://a.com", title: "A" },
    { type: "document", title: "Book", pages: "p. 3" },
    { type: "document", title: "Book", pages: "pp. 5-7" },
  ]);

  const uncited = extractSources([
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://b.com", title: "B" }] },
    { type: "text", text: "answer" },
  ]);
  assert.deepEqual(uncited, [{ type: "web", url: "https://b.com", title: "B" }]);

  // an error result (object, not array) is ignored
  assert.deepEqual(extractSources([{ type: "web_search_tool_result", content: { error_code: "max_uses_exceeded" } }]), []);
});
