import type { VizSpec } from "@/components/Visualization";

export interface ExtractedViz {
  // The model's text with each fenced studybase-viz block replaced by a
  // short anchor like "Diagram 1: title (see below)". Safe to render via
  // ReactMarkdown without ever touching D3.
  cleanText: string;
  // Successfully parsed visualization specs, in source order.
  specs: VizSpec[];
}

// Pull every ```studybase-viz fenced JSON block out of the assistant text
// so we can render charts in a single section AFTER the prose, and keep
// the streaming text itself cheap to re-render. Invalid JSON blocks get
// left in-place — MarkdownMessage shows the parse-error fallback for them.
//
// When `streaming` is true, also hide any UNCLOSED trailing fenced block
// (the model may have emitted ``` ```studybase-viz {...` but not yet the
// closing ``` ```). This prevents partial JSON from being rendered as
// code mid-stream, which is what was thrashing the layout.
export function extractVizSpecs(
  text: string,
  opts: { streaming?: boolean } = {},
): ExtractedViz {
  const specs: VizSpec[] = [];
  const re = /```studybase-viz\s*([\s\S]*?)```/g;

  let cleanText = text.replace(re, (_match, body: string) => {
    let spec: VizSpec | null = null;
    try {
      spec = JSON.parse(body) as VizSpec;
    } catch {
      return "```studybase-viz\n" + body.trim() + "\n```";
    }
    specs.push(spec);
    const idx = specs.length;
    const title =
      spec && "title" in spec && spec.title ? `: *${spec.title}*` : "";
    return `\n\n> **Diagram ${idx}${title}** — see *Visualizations* below.\n\n`;
  });

  if (opts.streaming) {
    cleanText = cleanText.replace(
      /```studybase-viz[\s\S]*$/,
      "\n\n> _diagram rendering after answer completes…_\n\n",
    );
  }

  return { cleanText, specs };
}
