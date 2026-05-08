"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

export function Composer({
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  size = "default",
  placeholder,
  autoFocus = false,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  size?: "default" | "hero";
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [input]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isHero = size === "hero";

  return (
    <div
      className={`relative flex items-end gap-2 rounded-2xl border bg-white shadow-sm transition focus-within:border-slate-900 focus-within:shadow-md ${
        isHero
          ? "border-slate-300 p-3"
          : "border-slate-300 p-2 focus-within:ring-2 focus-within:ring-blue-100"
      }`}
    >
      <textarea
        ref={taRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          placeholder ??
          "Ask anything — concepts, problem sets, past exams…"
        }
        rows={1}
        className={`flex-1 resize-none border-0 bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none ${
          isHero ? "px-3 py-2 text-base leading-7" : "px-2 py-2 text-[15px] leading-6"
        }`}
        disabled={isStreaming}
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className={`flex items-center justify-center rounded-lg bg-slate-900 font-medium text-white hover:bg-slate-800 ${
            isHero ? "h-10 px-4 text-sm" : "h-9 px-3 text-xs"
          }`}
        >
          Stop
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className={`flex items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${
            isHero ? "h-10 w-10" : "h-9 w-9"
          }`}
          aria-label="Send"
        >
          <ArrowUp className={isHero ? "h-5 w-5" : "h-4 w-4"} />
        </button>
      )}
    </div>
  );
}
