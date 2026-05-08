"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Plus, AlertCircle, Menu } from "lucide-react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { ResourceCard, Resource } from "@/components/ResourceCard";
import { WebResultCard, WebResult } from "@/components/WebResultCard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Visualization } from "@/components/Visualization";
import { extractVizSpecs } from "@/lib/extractViz";
import { Composer } from "@/components/Composer";
import { Welcome } from "@/components/Welcome";
import {
  ChatIndexEntry,
  RawMessage,
  StoredChat,
  StoredTurn,
  buildWireMessages,
  deleteChat,
  listChats,
  loadChat,
  makeChatId,
  saveChat,
} from "@/lib/chatStorage";

export default function Home() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<StoredTurn[]>([]);
  const [chats, setChats] = useState<ChatIndexEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const createdAtRef = useRef<number | null>(null);

  const refreshChatList = useCallback(() => {
    setChats(listChats());
  }, []);

  // Boot: load most recent chat (if any) on first mount.
  useEffect(() => {
    const list = listChats();
    setChats(list);
    if (list.length > 0) {
      const recent = loadChat(list[0].id);
      if (recent) {
        setChatId(recent.id);
        setTurns(recent.turns);
        createdAtRef.current = recent.createdAt;
      }
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const persist = useCallback(
    (turnsToSave: StoredTurn[], explicitId?: string) => {
      if (turnsToSave.length === 0) return null;
      const id = explicitId || chatId || makeChatId();
      const createdAt = createdAtRef.current || Date.now();
      const chat: StoredChat = {
        id,
        title: "",
        createdAt,
        updatedAt: Date.now(),
        turns: turnsToSave,
      };
      const saved = saveChat(chat);
      createdAtRef.current = saved.createdAt;
      if (id !== chatId) setChatId(id);
      refreshChatList();
      return saved;
    },
    [chatId, refreshChatList],
  );

  const startNewChat = useCallback(() => {
    if (isStreaming) abortRef.current?.abort();
    setChatId(null);
    setTurns([]);
    setError(null);
    setInput("");
    createdAtRef.current = null;
    setSidebarOpen(false);
  }, [isStreaming]);

  const openChat = useCallback(
    (id: string) => {
      if (isStreaming) abortRef.current?.abort();
      const c = loadChat(id);
      if (!c) return;
      setChatId(c.id);
      setTurns(c.turns);
      createdAtRef.current = c.createdAt;
      setError(null);
      setSidebarOpen(false);
    },
    [isStreaming],
  );

  const removeChat = useCallback(
    (id: string) => {
      deleteChat(id);
      refreshChatList();
      if (id === chatId) {
        setChatId(null);
        setTurns([]);
        createdAtRef.current = null;
      }
    },
    [chatId, refreshChatList],
  );

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setError(null);

    const userTurn: StoredTurn = {
      id: makeChatId(),
      role: "user",
      content: trimmed,
    };
    const assistantTurn: StoredTurn = {
      id: makeChatId(),
      role: "assistant",
      content: "",
      resources: [],
      webResults: [],
      rawMessages: [],
    };

    const turnsBefore = turns;
    const nextTurns = [...turnsBefore, userTurn, assistantTurn];
    setTurns(nextTurns);
    setInput("");
    setIsStreaming(true);

    // Persist immediately so a refresh mid-stream still preserves the user's
    // message and any partial assistant output we ship in.
    const ensuredId = persist(nextTurns)?.id || chatId || makeChatId();

    const wireMessages: RawMessage[] = buildWireMessages(turnsBefore, trimmed);

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: wireMessages }),
        signal: ctl.signal,
      });

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => null);
        throw new Error(j?.error || `Request failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateAssistant = (patch: Partial<StoredTurn>) => {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurn.id ? { ...t, ...patch } : t,
          ),
        );
      };

      const appendDelta = (delta: string) => {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurn.id
              ? { ...t, content: t.content + delta }
              : t,
          ),
        );
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          switch (evt.type) {
            case "delta":
              appendDelta(String(evt.text || ""));
              break;
            case "tool_call":
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantTurn.id
                    ? {
                        ...t,
                        // Track only the most recent tool call name for UI.
                        // We don't persist this — it's transient.
                      }
                    : t,
                ),
              );
              break;
            case "resources": {
              const list = (evt.resources as Resource[]) || [];
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantTurn.id
                    ? {
                        ...t,
                        resources: [...(t.resources || []), ...list],
                      }
                    : t,
                ),
              );
              break;
            }
            case "web_results": {
              const list = (evt.results as WebResult[]) || [];
              const ok = evt.ok !== false;
              const errorMsg = ok ? null : String(evt.error || "");
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantTurn.id
                    ? {
                        ...t,
                        webResults: [...(t.webResults || []), ...list],
                        webError: errorMsg,
                      }
                    : t,
                ),
              );
              break;
            }
            case "turn_meta": {
              const raw = (evt.rawMessages as RawMessage[]) || [];
              updateAssistant({ rawMessages: raw });
              break;
            }
            case "done":
              break;
            case "error":
              throw new Error(String(evt.message || "Stream error"));
          }
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong.";
      if ((err as Error).name !== "AbortError") setError(msg);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantTurn.id
            ? {
                ...t,
                content:
                  t.content ||
                  "_The tutor hit an error. Try rephrasing or sending again._",
              }
            : t,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // Final persist: capture the completed assistant turn (with rawMessages
      // and any resources/web results) into storage.
      setTurns((prev) => {
        persist(prev, ensuredId);
        return prev;
      });
    }
  };

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const hasChat = turns.length > 0;
  const activeChats = useMemo(() => chats, [chats]);

  const handleSend = useCallback(() => send(input), [input]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen bg-[#fafaf9]">
      <ChatSidebar
        open={sidebarOpen}
        chats={activeChats}
        activeId={chatId}
        onClose={() => setSidebarOpen(false)}
        onNew={startNewChat}
        onPick={openChat}
        onDelete={removeChat}
      />

      <div className="flex h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Open chat list"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span className="font-serif text-base font-semibold tracking-tight text-slate-900">
                StudyBase
              </span>
            </div>
          </div>
          <button
            onClick={startNewChat}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-900"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </header>

        {hasChat ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-6">
                <ul className="space-y-6">
                  {turns.map((t) => (
                    <li key={t.id}>
                      {t.role === "user" ? (
                        <UserBubble text={t.content} />
                      ) : (
                        <AssistantBubble
                          turn={t}
                          pending={
                            isStreaming &&
                            t.id === turns[turns.length - 1]?.id
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>{error}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur">
              <div className="mx-auto w-full max-w-3xl">
                <Composer
                  input={input}
                  setInput={setInput}
                  onSend={handleSend}
                  onStop={stop}
                  isStreaming={isStreaming}
                />
                <p className="mt-1.5 text-center text-[11px] text-slate-400">
                  Shift+Enter for newline · chats saved locally
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center overflow-y-auto py-10">
            <Welcome
              onPick={(t) => send(t)}
              composer={
                <Composer
                  input={input}
                  setInput={setInput}
                  onSend={handleSend}
                  onStop={stop}
                  isStreaming={isStreaming}
                  size="hero"
                  autoFocus
                />
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-[15px] leading-6 text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  turn,
  pending,
}: {
  turn: StoredTurn;
  pending: boolean;
}) {
  // Always extract specs (stream-safe). During streaming we hide the
  // diagram blocks (no D3) and only show them once the stream completes.
  const { cleanText, specs } = useMemo(
    () => extractVizSpecs(turn.content || "", { streaming: pending }),
    [turn.content, pending],
  );

  const resourceCount = turn.resources?.length || 0;
  const webCount = turn.webResults?.length || 0;
  const vizCount = specs.length;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
        <Brain className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        {/* TEXT — always first. */}
        {cleanText ? (
          <MarkdownMessage text={cleanText} />
        ) : pending ? (
          <ThinkingDots />
        ) : (
          <div className="text-sm italic text-slate-500">(no response)</div>
        )}

        {pending && cleanText && (
          <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />
        )}

        {/* STREAMING STATUS PILLS — show counts only, don't render the
            heavy stuff yet. Layout stays stable. */}
        {pending && (resourceCount > 0 || webCount > 0 || vizCount > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {resourceCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                📚 {resourceCount} library resource
                {resourceCount === 1 ? "" : "s"}
              </span>
            )}
            {webCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                🌐 {webCount} web source{webCount === 1 ? "" : "s"}
              </span>
            )}
            {vizCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs text-purple-700">
                📊 {vizCount} diagram{vizCount === 1 ? "" : "s"}
              </span>
            )}
            <span className="text-[11px] text-slate-400">
              will appear below when the answer completes
            </span>
          </div>
        )}

        {/* POST-STREAM ORDER: text → DB → web → graphs. */}
        {!pending && turn.resources && turn.resources.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              From the StudyBase library
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {turn.resources.map((r) => (
                <ResourceCard key={r.id} resource={r} />
              ))}
            </div>
          </div>
        )}

        {!pending && turn.webResults && turn.webResults.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              From the web
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {turn.webResults.map((r, i) => (
                <WebResultCard key={`${r.url}-${i}`} result={r} />
              ))}
            </div>
          </div>
        )}

        {!pending && specs.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Visualizations
            </div>
            <div className="space-y-3">
              {specs.map((spec, i) => (
                <Visualization key={i} spec={spec} />
              ))}
            </div>
          </div>
        )}

        {turn.webError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Web search unavailable: {turn.webError}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
    </div>
  );
}
