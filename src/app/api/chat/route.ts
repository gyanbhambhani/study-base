import { NextRequest } from "next/server";
import OpenAI from "openai";
import { TUTOR_SYSTEM_PROMPT, TOOL_DEFS } from "@/lib/chatPrompt";
import {
  findCandidateResources,
  rerankResources,
  CourseResource,
} from "@/lib/resourceSearch";
import { webSearch, WebResult } from "@/lib/webSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WireMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const MODEL = process.env.STUDYBASE_MODEL || "gpt-4o";
const MAX_TOOL_ROUNDS = 4;
// Rough char budget (~4 chars/token => ~60k tokens for history). gpt-4o has
// a 128k context; we leave plenty of headroom for system prompt + output.
const HISTORY_CHAR_BUDGET = 240_000;

// Wire format: newline-delimited JSON events. Each line is one event.
// type: "delta" | "resources" | "web_results" | "tool_call" | "turn_meta"
//     | "done" | "error"
function sseLine(event: Record<string, unknown>): string {
  return JSON.stringify(event) + "\n";
}

// Trim history (everything after the system message) by dropping whole
// turn groups from the front. A turn group = a user message + all messages
// up to (not including) the next user message. This preserves the
// assistant→tool dependency chain that OpenAI requires.
function trimHistory(
  history: WireMessage[],
  budgetChars: number,
): { kept: WireMessage[]; dropped: number } {
  const userIdx: number[] = [];
  history.forEach((m, i) => {
    if (m.role === "user") userIdx.push(i);
  });
  if (userIdx.length === 0) return { kept: history, dropped: 0 };

  const groups: WireMessage[][] = [];
  for (let k = 0; k < userIdx.length; k++) {
    const start = userIdx[k];
    const end = k + 1 < userIdx.length ? userIdx[k + 1] : history.length;
    groups.push(history.slice(start, end));
  }

  let total = 0;
  const kept: WireMessage[][] = [];
  for (let k = groups.length - 1; k >= 0; k--) {
    const len = JSON.stringify(groups[k]).length;
    // Always keep the last group (the new user message).
    if (kept.length === 0 || total + len <= budgetChars) {
      kept.unshift(groups[k]);
      total += len;
    } else {
      break;
    }
  }
  const droppedGroups = groups.length - kept.length;
  return { kept: kept.flat(), dropped: droppedGroups };
}

async function runResourceSearch(
  args: { query: string; extra_terms?: string[] },
  openai: OpenAI,
): Promise<CourseResource[]> {
  const candidates = await findCandidateResources(
    args.query,
    args.extra_terms || [],
  );
  if (candidates.length === 0) return [];
  return rerankResources(args.query, candidates, openai, 8);
}

async function runWebSearch(args: {
  query: string;
  prefer_berkeley?: boolean;
  max_results?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  results: WebResult[];
  answer?: string;
}> {
  return webSearch(args.query, {
    preferBerkeley: !!args.prefer_berkeley,
    maxResults: args.max_results,
  });
}

export async function POST(req: NextRequest) {
  let body: { messages?: WireMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const incoming = (body.messages || []).filter(
    (m): m is WireMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as WireMessage).role === "string",
  );
  if (incoming.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Drop any client-provided system messages — we own the system prompt.
  const history = incoming.filter((m) => m.role !== "system");

  const { kept: trimmed, dropped } = trimHistory(history, HISTORY_CHAR_BUDGET);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseLine(e)));

      let trailingTrimNotice: WireMessage | null = null;
      if (dropped > 0) {
        trailingTrimNotice = {
          role: "system",
          content:
            `[Context note: ${dropped} earlier turn group(s) were trimmed ` +
            `to fit the model's context window. The student is aware older ` +
            `messages may not be in scope.]`,
        };
      }

      const convo: WireMessage[] = [
        { role: "system", content: TUTOR_SYSTEM_PROMPT },
        ...(trailingTrimNotice ? [trailingTrimNotice] : []),
        ...trimmed,
      ];

      // Track everything we APPEND to convo from the moment the model
      // takes over (i.e., everything after the trailing user message).
      // This is what we ship back as `turn_meta.rawMessages` so the client
      // can re-include it on next send.
      const turnMeta: WireMessage[] = [];

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const isLast = round === MAX_TOOL_ROUNDS - 1;
          const stream = await openai.chat.completions.create({
            model: MODEL,
            messages: convo,
            tools: isLast ? undefined : TOOL_DEFS,
            tool_choice: isLast ? undefined : "auto",
            temperature: 0.4,
            stream: true,
          });

          const pendingToolCalls: Record<
            number,
            { id: string; name: string; args: string }
          > = {};
          let assistantText = "";
          let finishReason: string | null = null;

          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (delta?.content) {
              assistantText += delta.content;
              send({ type: "delta", text: delta.content });
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!pendingToolCalls[idx]) {
                  pendingToolCalls[idx] = {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    args: "",
                  };
                }
                if (tc.id) pendingToolCalls[idx].id = tc.id;
                if (tc.function?.name) {
                  pendingToolCalls[idx].name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  pendingToolCalls[idx].args += tc.function.arguments;
                }
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          const toolCallList = Object.values(pendingToolCalls);

          if (finishReason === "tool_calls" && toolCallList.length > 0) {
            const assistantMsg: WireMessage = {
              role: "assistant",
              content: assistantText || null,
              tool_calls: toolCallList.map((t) => ({
                id: t.id,
                type: "function",
                function: { name: t.name, arguments: t.args || "{}" },
              })),
            } as WireMessage;
            convo.push(assistantMsg);
            turnMeta.push(assistantMsg);

            for (const tc of toolCallList) {
              const args = safeParse(tc.args) as Record<string, unknown>;
              send({ type: "tool_call", name: tc.name, args });

              if (tc.name === "search_resources") {
                const resources = await runResourceSearch(
                  {
                    query: String(args.query || ""),
                    extra_terms: Array.isArray(args.extra_terms)
                      ? (args.extra_terms as string[])
                      : [],
                  },
                  openai,
                );
                send({ type: "resources", resources });
                const toolMsg: WireMessage = {
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    count: resources.length,
                    resources: resources.map((r) => ({
                      id: r.id,
                      course: r.course_code,
                      type: r.resource_type,
                      semester: r.semester,
                      year: r.year,
                      instructor: r.metadata?.instructor || "",
                      relevance: r.relevance,
                      why: r.why,
                      url: r.resource_url,
                    })),
                  }),
                } as WireMessage;
                convo.push(toolMsg);
                turnMeta.push(toolMsg);
              } else if (tc.name === "web_search") {
                const result = await runWebSearch({
                  query: String(args.query || ""),
                  prefer_berkeley: !!args.prefer_berkeley,
                  max_results:
                    typeof args.max_results === "number"
                      ? args.max_results
                      : undefined,
                });
                send({
                  type: "web_results",
                  query: args.query,
                  results: result.results,
                  ok: result.ok,
                  error: result.error,
                });
                const toolMsg: WireMessage = {
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    ok: result.ok,
                    error: result.error,
                    answer: result.answer,
                    results: result.results.map((r) => ({
                      title: r.title,
                      url: r.url,
                      snippet: r.snippet,
                      source: r.source,
                    })),
                  }),
                } as WireMessage;
                convo.push(toolMsg);
                turnMeta.push(toolMsg);
              } else {
                const toolMsg: WireMessage = {
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({ error: "unknown tool" }),
                } as WireMessage;
                convo.push(toolMsg);
                turnMeta.push(toolMsg);
              }
            }
            continue;
          }

          // Final assistant text turn — record it.
          const finalMsg: WireMessage = {
            role: "assistant",
            content: assistantText || "",
          };
          turnMeta.push(finalMsg);
          break;
        }

        send({ type: "turn_meta", rawMessages: turnMeta, dropped });
        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[/api/chat] error:", err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
