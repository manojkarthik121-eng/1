// Thin wrapper around the Anthropic SDK: structured JSON generation and
// streaming chat. In mock mode (LUMINARY_MOCK=1) canned responses are
// returned so the app can be demoed and tested without an API key.
import Anthropic from "@anthropic-ai/sdk";
import * as mock from "./mock.js";

export const MODEL = process.env.LUMINARY_MODEL || "claude-opus-5";
export const MOCK = process.env.LUMINARY_MOCK === "1";

// Server-side refusal fallbacks: if a safety classifier declines a request,
// the API re-runs it on a fallback model inside the same call.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);
const USE_FALLBACKS =
  process.env.LUMINARY_FALLBACKS !== "0" && FALLBACK_MODELS.has(MODEL);

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

/**
 * Ask Claude for a JSON object matching `schema`.
 * `kind` selects the canned response in mock mode.
 */
export async function generateJSON({ kind, system, prompt, schema, effort = "high", maxTokens = 32000 }) {
  if (MOCK) return mock.json(kind, prompt);
  try {
    const params = baseParams(effort);
    params.output_config.format = { type: "json_schema", schema };
    const stream = getClient().beta.messages.stream({
      ...params,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
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

/**
 * Stream a tutoring reply. Calls onText(delta) for each chunk and resolves
 * with the full reply text.
 */
export async function streamChat({ system, messages, onText, signal, effort = "medium" }) {
  if (MOCK) return mock.chat(messages, onText);
  try {
    const stream = getClient().beta.messages.stream(
      {
        ...baseParams(effort),
        max_tokens: 64000,
        system,
        messages,
      },
      { signal },
    );
    stream.on("text", (delta) => onText(delta));
    const message = await stream.finalMessage();
    checkStop(message, { allowTruncated: true });
    return message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    throw toAppError(err);
  }
}
