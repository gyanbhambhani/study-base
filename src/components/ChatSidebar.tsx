"use client";

import { Plus, Trash2, MessageSquare, X } from "lucide-react";
import type { ChatIndexEntry } from "@/lib/chatStorage";

export function ChatSidebar({
  open,
  chats,
  activeId,
  onClose,
  onNew,
  onPick,
  onDelete,
}: {
  open: boolean;
  chats: ChatIndexEntry[];
  activeId: string | null;
  onClose: () => void;
  onNew: () => void;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 transform flex-col border-r border-slate-200 bg-white transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
          <span className="text-sm font-semibold text-slate-900">
            Your chats
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          <button
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {chats.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No saved chats yet. Start one — it'll persist here through
              page reloads.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => (
                <li
                  key={c.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                    c.id === activeId
                      ? "bg-blue-50 text-blue-900"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <button
                    onClick={() => onPick(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <span className="truncate" title={c.title}>
                      {c.title}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(`Delete "${c.title}"? This can't be undone.`)
                      ) {
                        onDelete(c.id);
                      }
                    }}
                    className="rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-red-500 group-hover:opacity-100"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-400">
          Saved on this device only.
        </div>
      </aside>
    </>
  );
}
