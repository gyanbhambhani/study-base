"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Visualization, VizSpec } from "./Visualization";

// Renders a single assistant turn:
// - GitHub-flavored markdown (tables, task lists)
// - LaTeX math via KaTeX ($...$ inline, $$...$$ display)
// - Custom `studybase-viz` fenced code blocks -> live D3 figures
export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:scroll-mt-20 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-50 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props) {
            const { className, children, ...rest } = props as {
              className?: string;
              children?: React.ReactNode;
            };
            const match = /language-(\w[\w-]*)/.exec(className || "");
            const lang = match?.[1];
            const raw = String(children || "").replace(/\n$/, "");

            if (lang === "studybase-viz") {
              try {
                const spec = JSON.parse(raw) as VizSpec;
                return <Visualization spec={spec} />;
              } catch {
                return (
                  <pre className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    Visualization could not be parsed:
                    {"\n"}
                    {raw}
                  </pre>
                );
              }
            }

            // Inline code (no language) — keep it inline.
            if (!match) {
              return (
                <code
                  className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-800"
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
