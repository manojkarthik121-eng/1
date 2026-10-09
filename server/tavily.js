// Web search through Tavily (https://tavily.com), used instead of Claude's
// built-in web_search tool when TAVILY_API_KEY is set. Claude calls it as a
// normal client tool, and the results go back as `search_result` blocks so
// they can be cited just like built-in search results.

const ENDPOINT = "https://api.tavily.com/search";
const MAX_RESULTS = 5;
const MAX_CONTENT_CHARS = 4000;

/** Tool definition sent to Claude. */
export const TOOL = {
  name: "web_search",
  description:
    "Search the web for current or checkable information (news, prices, recent research, statistics, versions). " +
    "Returns the most relevant pages with extracted content. Use a short, specific query.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
};

export class SearchError extends Error {}

/** Run a Tavily search. Resolves with [{ url, title, content }]. */
export async function search(query, { apiKey = process.env.TAVILY_API_KEY, signal, fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: MAX_RESULTS, search_depth: "basic" }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new SearchError(`Could not reach Tavily: ${err.message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new SearchError(`Tavily search failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = await res.json();
  return (data.results ?? [])
    .filter((r) => r?.url && r?.content)
    .map((r) => ({ url: r.url, title: r.title || r.url, content: String(r.content).slice(0, MAX_CONTENT_CHARS) }));
}

/**
 * Run the search for one tool_use block and build its tool_result. Failures
 * are reported to Claude as an error result so it can answer without them.
 */
export async function toolResult(block, options) {
  const query = String(block.input?.query ?? "").trim();
  try {
    if (!query) throw new SearchError("Empty search query.");
    const results = await search(query, options);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: results.length
        ? results.map((r) => ({
            type: "search_result",
            source: r.url,
            title: r.title,
            content: [{ type: "text", text: r.content }],
            citations: { enabled: true },
          }))
        : [{ type: "text", text: "No results found." }],
    };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: err.message };
  }
}
