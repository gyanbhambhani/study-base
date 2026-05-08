// Client-side chat persistence in localStorage.
//
// Choice: localStorage over Firestore for now because (a) it survives reloads,
// which is the actual user need, (b) requires zero auth, (c) is instant.
// Upgrade path to Firestore + anonymous auth is straightforward; the data
// shape here mirrors what a `chats/{chatId}` doc would look like.

import type { Resource } from "@/components/ResourceCard";
import type { WebResult } from "@/components/WebResultCard";

// Looser than openai's typed param so we don't have to install client deps;
// we only round-trip these blobs back to the server, which validates them.
export type RawMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};

export interface StoredTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources?: Resource[];
  webResults?: WebResult[];
  webError?: string | null;
  // For assistant turns: the canonical OpenAI message sequence the server
  // used to produce this turn (assistant tool_calls msgs + tool responses
  // + the final assistant text). Re-included on subsequent requests so the
  // model retains its tool history.
  rawMessages?: RawMessage[];
}

export interface ChatIndexEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredChat extends ChatIndexEntry {
  turns: StoredTurn[];
}

const INDEX_KEY = "studybase:chats:index:v1";
const CHAT_KEY = (id: string) => `studybase:chat:v1:${id}`;
const MAX_CHATS = 50;

const isClient = () => typeof window !== "undefined";

function readIndex(): ChatIndexEntry[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ChatIndexEntry[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("chatStorage: failed to write index:", e);
  }
}

export function makeChatId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function listChats(): ChatIndexEntry[] {
  return [...readIndex()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadChat(id: string): StoredChat | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(CHAT_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as StoredChat;
  } catch {
    return null;
  }
}

// Generate a short title from the first user message.
function deriveTitle(turns: StoredTurn[]): string {
  const firstUser = turns.find((t) => t.role === "user");
  if (!firstUser) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

export function saveChat(chat: StoredChat): StoredChat {
  if (!isClient()) return chat;
  const updated = { ...chat, updatedAt: Date.now() };
  if (!updated.title || updated.title === "New chat") {
    updated.title = deriveTitle(updated.turns);
  }

  try {
    localStorage.setItem(CHAT_KEY(updated.id), JSON.stringify(updated));
  } catch (e) {
    // Likely a quota error. Try evicting oldest chats first.
    console.warn("chatStorage: write failed, evicting oldest:", e);
    pruneOldest(5);
    try {
      localStorage.setItem(CHAT_KEY(updated.id), JSON.stringify(updated));
    } catch (e2) {
      console.error("chatStorage: still failed after eviction:", e2);
      return updated;
    }
  }

  const idx = readIndex().filter((e) => e.id !== updated.id);
  idx.unshift({
    id: updated.id,
    title: updated.title,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
  // Cap chat count to keep storage bounded.
  while (idx.length > MAX_CHATS) {
    const dropped = idx.pop();
    if (dropped) localStorage.removeItem(CHAT_KEY(dropped.id));
  }
  writeIndex(idx);
  return updated;
}

export function deleteChat(id: string): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(CHAT_KEY(id));
  } catch {
    // Ignore.
  }
  writeIndex(readIndex().filter((e) => e.id !== id));
}

function pruneOldest(n: number): void {
  const idx = [...readIndex()].sort((a, b) => a.updatedAt - b.updatedAt);
  for (let i = 0; i < Math.min(n, idx.length); i++) {
    localStorage.removeItem(CHAT_KEY(idx[i].id));
  }
  const surviving = readIndex().filter(
    (e) => !idx.slice(0, n).some((o) => o.id === e.id),
  );
  writeIndex(surviving);
}

// Build the wire-format messages we send to /api/chat from a chat's turns
// plus the brand-new pending user message. Expands assistant turns into
// their preserved tool-call sequences whenever available.
export function buildWireMessages(
  turns: StoredTurn[],
  newUserText: string,
): RawMessage[] {
  const out: RawMessage[] = [];
  for (const t of turns) {
    if (t.role === "user") {
      out.push({ role: "user", content: t.content });
    } else if (t.role === "assistant") {
      if (t.rawMessages && t.rawMessages.length > 0) {
        out.push(...t.rawMessages);
      } else {
        out.push({ role: "assistant", content: t.content });
      }
    }
  }
  out.push({ role: "user", content: newUserText });
  return out;
}
