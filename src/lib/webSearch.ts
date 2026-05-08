// Web search tool, backed by Tavily (https://tavily.com).
// Tavily has a free tier (1000 req/mo) and is purpose-built for LLM agents.
// Set TAVILY_API_KEY in .env.local. If unset, the tool returns a helpful
// error that the model relays to the user instead of fabricating links.

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchResponse {
  ok: boolean;
  query: string;
  answer?: string;
  results: WebResult[];
  error?: string;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}
interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

// Berkeley-relevant domains we boost when the model wants class material.
// Not exhaustive; the model can still bring back any URL.
const BERKELEY_DOMAINS = [
  "berkeley.edu",
  "tbp.berkeley.edu",
  "tbp.studentorg.berkeley.edu",
  "github.io", // many student-run course sites live here
];

export async function webSearch(
  query: string,
  opts: {
    maxResults?: number;
    preferBerkeley?: boolean;
  } = {},
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      query,
      results: [],
      error:
        "Web search is not configured. Add TAVILY_API_KEY to .env.local " +
        "(grab a free key at https://tavily.com).",
    };
  }

  const maxResults = Math.min(opts.maxResults ?? 6, 10);
  const includeDomains = opts.preferBerkeley ? BERKELEY_DOMAINS : undefined;

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: true,
        include_domains: includeDomains,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        query,
        results: [],
        error: `Tavily error ${resp.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await resp.json()) as TavilyResponse;
    const results: WebResult[] = (data.results || []).map((r) => {
      let host = "";
      try {
        host = new URL(r.url || "").hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      return {
        title: r.title || r.url || "(untitled)",
        url: r.url || "",
        snippet: (r.content || "").slice(0, 400),
        source: host,
      };
    });

    return {
      ok: true,
      query,
      answer: data.answer,
      results,
    };
  } catch (err) {
    return {
      ok: false,
      query,
      results: [],
      error: err instanceof Error ? err.message : "Unknown web-search error",
    };
  }
}
