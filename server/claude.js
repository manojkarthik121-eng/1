// Thin wrapper around the Anthropic SDK: structured JSON generation and
// streaming chat. In mock mode (LUMINARY_MOCK=1) canned responses are
// returned so the app can be demoed and tested without an API key.
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import * as mock from "./mock.js";

export const MODEL = process.env.LUMINARY_MODEL || "claude-opus-5";
export const MOCK = process.env.LUMINARY_MOCK === "1" || process.argv.includes("--demo");

// Server-side refusal fallbacks: if a safety classifier declines a request,
// the API re-runs it on a fallback model inside the same call.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);
const USE_FALLBACKS =
  process.env.LUMINARY_FALLBACKS !== "0" && FALLBACK_MODELS.has(MODEL);

// Web search is a server tool: Claude decides when a question needs it.
export const WEB_SEARCH = process.env.LUMINARY_WEB_SEARCH !== "0";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let client;
const getClient = () => (client ??= new Anthropic());

function baseParams(effort) {
  const params = {
    model: MODEL,
    thinking: { type: "adaptive" },
    output_config: { effort },
  };
  if (USE_FALLBACKS) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
}

function checkStop(message, { allowTruncated = false } = {}) {
  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation;
    throw new AppError(422, `Claude declined this request${why ? `: ${why}` : "."}`);
  }
  if (message.stop_reason === "max_tokens" && !allowTruncated) {
    throw new AppError(502, "The response was cut off (too long). Try a narrower topic.");
  }
}

export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new AppError(401, "Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY and restart, or run with LUMINARY_MOCK=1 to try the demo.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError(429, "Rate limited by the Anthropic API. Wait a moment and try again.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError(400, `The Anthropic API rejected the request: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError(503, "Could not reach the Anthropic API. Check your network connection.");
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError(502, `Anthropic API error (${err.status ?? "unknown"}): ${err.message}`);
  }
  if (err instanceof Error && /API key|apiKey|authToken/i.test(err.message)) {
    return new AppError(401, "No Anthropic credentials found. Set ANTHROPIC_API_KEY (see .env.example), or run `npm run demo` for offline demo mode.");
  }
  return new AppError(500, err?.message || "Unexpected error");
}

// ---------- documents (PDFs via the Files API) ----------

/** Upload a PDF once; later requests reference it by file_id. */
export async function uploadPdf(buffer, filename) {
  if (MOCK) return { id: `file_mock_${Date.now()}` };
  try {
    return await getClient().files.upload({
      file: await toFile(buffer, filename, { type: "application/pdf" }),
    });
  } catch (err) {
    throw toAppError(err);
  }
}

export async function deleteFile(fileId) {
  if (MOCK || !fileId) return;
  try {
    await getClient().files.delete(fileId);
  } catch {
    // Best effort: a missing remote file shouldn't block local cleanup.
  }
}

/**
 * Document content blocks for a topic's PDFs. The last block carries a cache
 * breakpoint so the (large, unchanging) documents are billed at cache-read
 * rates on follow-up requests. Citations can't be combined with structured
 * outputs, so they're only enabled for chat.
 */
function documentBlocks(documents = [], { citations = false } = {}) {
  return documents.map((doc, i) => ({
    type: "document",
    source: { type: "file", file_id: doc.fileId },
    title: doc.name,
    ...(citations && { citations: { enabled: true } }),
    ...(i === documents.length - 1 && { cache_control: { type: "ephemeral" } }),
  }));
}

// Pull de-duplicated sources out of a reply: web citations and search
// results, plus page-level citations into uploaded documents.
export function extractSources(content) {
  const sources = [];
  const seen = new Set();
  const add = (key, source) => {
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };
  for (const block of content) {
    if (block.type !== "text") continue;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location") {
        add(c.url, { type: "web", url: c.url, title: c.title || c.url });
      } else if (c.type === "page_location") {
        const pages = c.start_page_number === c.end_page_number - 1 || c.start_page_number === c.end_page_number
          ? `p. ${c.start_page_number}`
          : `pp. ${c.start_page_number}-${c.end_page_number - 1}`;
        add(`${c.document_title}|${pages}`, { type: "document", title: c.document_title || "Document", pages });
      }
    }
  }
  // If Claude searched but cited nothing inline, still show what it read.
  if (!sources.some((s) => s.type === "web")) {
    for (const block of content) {
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const r of block.content.slice(0, 5)) {
        if (r.type === "web_search_result") add(r.url, { type: "web", url: r.url, title: r.title || r.url });
      }
    }
  }
  return sources;
}

// ---------- generation ----------

/**
 * Ask Claude for a JSON object matching `schema`, optionally grounded in the
 * topic's documents. `kind` selects the canned response in mock mode.
 */
export async function generateJSON({ kind, system, prompt, schema, documents = [], effort = "high", maxTokens = 32000 }) {
  if (MOCK) return mock.json(kind, prompt);
  try {
    const params = baseParams(effort);
    params.output_config.format = { type: "json_schema", schema };
    const content = documents.length
      ? [...documentBlocks(documents), { type: "text", text: prompt }]
      : prompt;
    const stream = getClient().beta.messages.stream({
      ...params,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();
    checkStop(message);
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return JSON.parse(text);
  } catch (err) {
    throw toAppError(err);
  }
}

const MAX_CONTINUATIONS = 5;

/**
 * Stream a tutoring reply. Calls onText(delta) for each chunk and
 * onSearch(query) whenever Claude runs a web search. Resolves with
 * { text, sources }.
 */
export async function streamChat({ system, messages, documents = [], webSearch = false, onText, onSearch, signal, effort = "medium" }) {
  if (MOCK) return mock.chat(messages, onText, { webSearch, documents, onSearch });

  // Documents go in a fixed opening exchange so they form a stable, cacheable prefix.
  const convo = documents.length
    ? [
        { role: "user", content: [...documentBlocks(documents, { citations: true }), { type: "text", text: "These are my study materials for this topic. Use them when relevant and cite them." }] },
        { role: "assistant", content: "Got it - I'll draw on these materials and cite them where relevant." },
        ...messages,
      ]
    : [...messages];
  const tools = webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : undefined;

  try {
    const content = [];
    for (let i = 0; i < MAX_CONTINUATIONS; i++) {
      const stream = getClient().beta.messages.stream(
        { ...baseParams(effort), max_tokens: 64000, system, messages: convo, ...(tools && { tools }) },
        { signal },
      );
      stream.on("text", (delta) => onText(delta));
      stream.on("contentBlock", (block) => {
        if (block.type === "server_tool_use" && block.name === "web_search") onSearch?.(block.input?.query ?? "");
      });
      const message = await stream.finalMessage();
      content.push(...message.content);
      // A long server-tool turn can pause; send it back to let Claude continue.
      if (message.stop_reason === "pause_turn") {
        convo.push({ role: "assistant", content: message.content });
        continue;
      }
      checkStop(message, { allowTruncated: true });
      break;
    }
    return {
      text: content.filter((b) => b.type === "text").map((b) => b.text).join(""),
      sources: extractSources(content),
    };
  } catch (err) {
    throw toAppError(err);
  }
}
