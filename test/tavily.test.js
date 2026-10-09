// Tavily web search: request shape, result mapping and error handling,
// with a fake fetch (no network, no API key).
import test from "node:test";
import assert from "node:assert/strict";
import { search, toolResult, SearchError } from "../server/tavily.js";
import { extractSources } from "../server/claude.js";

const respond = (status, body) => async () => new Response(JSON.stringify(body), { status });

test("search sends the query and maps results", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return respond(200, { results: [
      { url: "https://a.com", title: "A", content: "alpha" },
      { url: "https://b.com", title: "", content: "beta" },
      { url: "https://c.com", title: "C" }, // no content: dropped
    ] })();
  };
  const results = await search("latest news", { apiKey: "tvly-test", fetchImpl });
  assert.equal(request.url, "https://api.tavily.com/search");
  assert.equal(request.init.headers.Authorization, "Bearer tvly-test");
  assert.equal(JSON.parse(request.init.body).query, "latest news");
  assert.deepEqual(results, [
    { url: "https://a.com", title: "A", content: "alpha" },
    { url: "https://b.com", title: "https://b.com", content: "beta" },
  ]);
});

test("search reports HTTP and network failures", async () => {
  await assert.rejects(search("q", { fetchImpl: respond(401, { detail: "bad key" }) }), (err) => err instanceof SearchError && /401/.test(err.message));
  await assert.rejects(search("q", { fetchImpl: async () => { throw new TypeError("fetch failed"); } }), SearchError);
});

test("toolResult returns citable search_result blocks, or an error result", async () => {
  const block = { type: "tool_use", id: "toolu_1", name: "web_search", input: { query: "q" } };
  const ok = await toolResult(block, { fetchImpl: respond(200, { results: [{ url: "https://a.com", title: "A", content: "alpha" }] }) });
  assert.deepEqual(ok, {
    type: "tool_result",
    tool_use_id: "toolu_1",
    content: [{ type: "search_result", source: "https://a.com", title: "A", content: [{ type: "text", text: "alpha" }], citations: { enabled: true } }],
  });

  const empty = await toolResult(block, { fetchImpl: respond(200, { results: [] }) });
  assert.deepEqual(empty.content, [{ type: "text", text: "No results found." }]);

  const failed = await toolResult(block, { fetchImpl: respond(500, {}) });
  assert.equal(failed.is_error, true);
  assert.match(failed.content, /500/);

  const blank = await toolResult({ ...block, input: { query: " " } }, { fetchImpl: respond(200, {}) });
  assert.equal(blank.is_error, true);
});

test("extractSources reads search_result citations and falls back to Tavily results", () => {
  const cited = extractSources([
    { type: "text", text: "a", citations: [{ type: "search_result_location", source: "https://a.com", title: "A" }] },
  ], [{ url: "https://z.com", title: "Z" }]);
  assert.deepEqual(cited, [{ type: "web", url: "https://a.com", title: "A" }]);

  const uncited = extractSources([{ type: "text", text: "a" }], [{ url: "https://z.com", title: "Z" }]);
  assert.deepEqual(uncited, [{ type: "web", url: "https://z.com", title: "Z" }]);
});
