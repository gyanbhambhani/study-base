"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// =====================================================================
// Schema — JSON the model emits inside ```studybase-viz fences.
// =====================================================================

type ElementDetail = {
  id?: string;
  label?: string;
  description?: string;
  link?: string;
};

type Node = { id: string; label: string; group?: string; description?: string };
type Link = {
  source: string;
  target: string;
  label?: string;
  description?: string;
};

type ConceptGraphSpec = {
  type: "concept-graph";
  title?: string;
  nodes: Node[];
  links: Link[];
};

type ChartPoint = { x: number; y: number; note?: string; label?: string };
type ChartSpec = {
  type: "chart";
  kind: "line" | "bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series: { name: string; points: ChartPoint[] }[];
};

type FunctionPlotSpec = {
  type: "function-plot";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  xRange: [number, number];
  samples?: number;
  functions: { name: string; expr: string; description?: string }[];
};

type ScatterSpec = {
  type: "scatter";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series: { name: string; points: ChartPoint[] }[];
  trendline?: boolean;
};

type HistogramSpec = {
  type: "histogram";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  bins: { x0: number; x1: number; count: number; note?: string }[];
};

type TimelineSpec = {
  type: "timeline";
  title?: string;
  events: {
    when: string;
    label: string;
    detail?: string;
    description?: string;
  }[];
};

type TreeNode = {
  id: string;
  label: string;
  description?: string;
  children?: TreeNode[];
};
type TreeSpec = {
  type: "tree";
  title?: string;
  orientation?: "vertical" | "horizontal";
  root: TreeNode;
};

type FlowchartSpec = {
  type: "flowchart";
  title?: string;
  orientation?: "vertical" | "horizontal";
  nodes: {
    id: string;
    label: string;
    kind?: "start" | "step" | "decision" | "end";
    description?: string;
  }[];
  edges: { source: string; target: string; label?: string }[];
};

type TableSpec = {
  type: "table";
  title?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | undefined>[];
};

export type VizSpec =
  | ConceptGraphSpec
  | ChartSpec
  | FunctionPlotSpec
  | ScatterSpec
  | HistogramSpec
  | TimelineSpec
  | TreeSpec
  | FlowchartSpec
  | TableSpec;

const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#dc2626",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

// =====================================================================
// Top-level wrapper with shared selection / detail panel.
// React.memo + JSON-equality on the spec so that unrelated parent
// re-renders (e.g. user typing in the composer) don't re-run the D3
// effects and "tweak out" the force layout.
// =====================================================================

function VisualizationImpl({ spec }: { spec: VizSpec }) {
  const [selected, setSelected] = useState<ElementDetail | null>(null);
  // Stable handlers so child memoization can rely on identity equality.
  const onSelect = useCallback<SelectFn>((d) => setSelected(d), []);
  const onClose = useCallback(() => setSelected(null), []);

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {"title" in spec && spec.title && (
        <figcaption className="border-b border-gray-100 bg-gray-50/50 px-4 py-2 text-sm font-semibold text-gray-700">
          {spec.title}
        </figcaption>
      )}
      <div className="w-full overflow-x-auto p-4">
        {spec.type === "concept-graph" && (
          <ConceptGraph spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "chart" && <Chart spec={spec} onSelect={onSelect} />}
        {spec.type === "function-plot" && (
          <FunctionPlot spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "scatter" && (
          <Scatter spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "histogram" && (
          <Histogram spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "timeline" && (
          <Timeline spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "tree" && <Tree spec={spec} onSelect={onSelect} />}
        {spec.type === "flowchart" && (
          <Flowchart spec={spec} onSelect={onSelect} />
        )}
        {spec.type === "table" && <Table spec={spec} onSelect={onSelect} />}
      </div>
      <DetailPanel selected={selected} onClose={onClose} />
    </figure>
  );
}

// Deep-equality on the spec via JSON. Specs are small objects emitted
// by the model — JSON.stringify is plenty fast and 100% accurate.
function specEquals(
  a: { spec: VizSpec },
  b: { spec: VizSpec },
): boolean {
  if (a.spec === b.spec) return true;
  try {
    return JSON.stringify(a.spec) === JSON.stringify(b.spec);
  } catch {
    return false;
  }
}

export const Visualization = memo(VisualizationImpl, specEquals);

function DetailPanel({
  selected,
  onClose,
}: {
  selected: ElementDetail | null;
  onClose: () => void;
}) {
  if (!selected) return null;
  return (
    <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50/60 to-purple-50/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {selected.label && (
            <div className="text-sm font-semibold text-slate-900">
              {selected.label}
            </div>
          )}
          {selected.description ? (
            <div className="prose prose-sm prose-slate mt-1 max-w-none text-slate-700">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {selected.description}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="mt-1 text-xs italic text-slate-500">
              No extra detail provided.
            </div>
          )}
          {selected.link && (
            <a
              href={selected.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-blue-600 underline"
            >
              Learn more →
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Close detail"
        >
          ×
        </button>
      </div>
    </div>
  );
}

type SelectFn = (d: ElementDetail) => void;

// =====================================================================
// Concept graph — force-directed, draggable, click-to-detail.
// =====================================================================

function ConceptGraph({
  spec,
  onSelect,
}: {
  spec: ConceptGraphSpec;
  onSelect: SelectFn;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select<SVGSVGElement, unknown>(ref.current);
    svg.selectAll("*").remove();

    const width = 680;
    const height = 380;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const groups = Array.from(
      new Set(spec.nodes.map((n) => n.group || "default")),
    );
    const color = d3.scaleOrdinal<string>().domain(groups).range(PALETTE);

    type SimNode = d3.SimulationNodeDatum & Node;
    type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string };

    const nodes: SimNode[] = spec.nodes.map((n) => ({ ...n }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = spec.links
      .map((l) => ({
        source: nodeById.get(l.source) || l.source,
        target: nodeById.get(l.target) || l.target,
        label: l.label,
      }))
      .filter(
        (l) => typeof l.source !== "string" && typeof l.target !== "string",
      );

    const root = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on("zoom", (e) => root.attr("transform", e.transform.toString()));
    svg.call(zoom);

    const sim = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.6),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-280))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius(42));

    const link = root
      .append("g")
      .attr("stroke", "#cbd5e1")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5);

    link.append("title").text((d) => d.label || "");

    const node = root
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join<SVGGElement>("g")
      .style("cursor", "pointer")
      .on("click", (e, d) => {
        e.stopPropagation();
        onSelect({
          id: d.id,
          label: d.label,
          description: d.description,
        });
      });

    node
      .append("circle")
      .attr("r", 24)
      .attr("fill", (d) => color(d.group || "default"))
      .attr("fill-opacity", 0.18)
      .attr("stroke", (d) => color(d.group || "default"))
      .attr("stroke-width", 2)
      .on("mouseover", function () {
        d3.select(this).attr("fill-opacity", 0.35);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 0.18);
      });

    node
      .append("title")
      .text((d) =>
        d.description ? `${d.label}\n\n${d.description}` : d.label,
      );

    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", 40)
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("fill", "#1f2937")
      .attr("pointer-events", "none");

    node.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
    };
  }, [spec, onSelect]);

  return (
    <div className="space-y-1">
      <svg ref={ref} className="w-full" style={{ minHeight: 380 }} />
      <p className="text-[11px] text-slate-400">
        Drag to rearrange · scroll to zoom · click a node for detail
      </p>
    </div>
  );
}

// =====================================================================
// Chart — line / bar with toggleable legend, point hover, click detail.
// =====================================================================

function Chart({
  spec,
  onSelect,
}: {
  spec: ChartSpec;
  onSelect: SelectFn;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 680;
    const height = 340;
    const margin = { top: 16, right: 24, bottom: 44, left: 56 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const visible = spec.series.filter((s) => !hidden.has(s.name));
    const allPoints = visible.flatMap((s) => s.points);
    if (allPoints.length === 0) return;

    const yExtent = d3.extent(allPoints, (p) => p.y) as [number, number];
    const yPad = (yExtent[1] - yExtent[0] || 1) * 0.1;

    const x =
      spec.kind === "bar"
        ? d3
            .scaleBand<number>()
            .domain(allPoints.map((p) => p.x))
            .range([margin.left, width - margin.right])
            .padding(0.2)
        : d3
            .scaleLinear()
            .domain(d3.extent(allPoints, (p) => p.x) as [number, number])
            .range([margin.left, width - margin.right]);

    const y = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x as d3.AxisScale<d3.NumberValue>).ticks(6))
      .call((g) => g.selectAll("text").attr("fill", "#475569"));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(6))
      .call((g) => g.selectAll("text").attr("fill", "#475569"));

    if (spec.xLabel) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.xLabel);
    }
    if (spec.yLabel) {
      svg
        .append("text")
        .attr("x", -(height / 2))
        .attr("y", 14)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.yLabel);
    }

    visible.forEach((s, i) => {
      const idx = spec.series.findIndex((x) => x.name === s.name);
      const c = PALETTE[idx % PALETTE.length];
      if (spec.kind === "line") {
        const xLin = x as d3.ScaleLinear<number, number>;
        const line = d3
          .line<ChartPoint>()
          .x((p) => xLin(p.x))
          .y((p) => y(p.y))
          .curve(d3.curveMonotoneX);
        svg
          .append("path")
          .datum(s.points)
          .attr("fill", "none")
          .attr("stroke", c)
          .attr("stroke-width", 2)
          .attr("d", line);
        svg
          .append("g")
          .selectAll("circle")
          .data(s.points)
          .join("circle")
          .attr("cx", (p) => xLin(p.x))
          .attr("cy", (p) => y(p.y))
          .attr("r", 3.5)
          .attr("fill", c)
          .style("cursor", "pointer")
          .on("mouseover", function () {
            d3.select(this).attr("r", 6);
          })
          .on("mouseout", function () {
            d3.select(this).attr("r", 3.5);
          })
          .on("click", (_e, p) =>
            onSelect({
              label:
                p.label || `${s.name}: (${p.x}, ${p.y})`,
              description: p.note,
            }),
          )
          .append("title")
          .text((p) => `${s.name}: (${p.x}, ${p.y})${p.note ? "\n" + p.note : ""}`);
      } else {
        const xb = x as d3.ScaleBand<number>;
        const slot = xb.bandwidth() / visible.length;
        svg
          .append("g")
          .selectAll("rect")
          .data(s.points)
          .join("rect")
          .attr(
            "x",
            (p) => (xb(p.x) ?? 0) + visible.indexOf(s) * slot,
          )
          .attr("y", (p) => y(p.y))
          .attr("width", slot * 0.95)
          .attr("height", (p) => y(yExtent[0] - yPad) - y(p.y))
          .attr("fill", c)
          .attr("opacity", 0.85)
          .style("cursor", "pointer")
          .on("click", (_e, p) =>
            onSelect({
              label: p.label || `${s.name}: ${p.x} → ${p.y}`,
              description: p.note,
            }),
          )
          .append("title")
          .text((p) => `${s.name}: ${p.x} → ${p.y}${p.note ? "\n" + p.note : ""}`);
      }
    });
  }, [spec, hidden, onSelect]);

  return (
    <div className="space-y-2">
      <svg ref={ref} className="w-full" style={{ minHeight: 340 }} />
      {spec.series.length > 1 && (
        <Legend
          series={spec.series.map((s, i) => ({
            name: s.name,
            color: PALETTE[i % PALETTE.length],
          }))}
          hidden={hidden}
          onToggle={(name) => {
            setHidden((prev) => {
              const next = new Set(prev);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            });
          }}
        />
      )}
    </div>
  );
}

function Legend({
  series,
  hidden,
  onToggle,
}: {
  series: { name: string; color: string }[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {series.map((s) => {
        const off = hidden.has(s.name);
        return (
          <button
            key={s.name}
            onClick={() => onToggle(s.name)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${
              off
                ? "border-slate-200 bg-white text-slate-400"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: off ? "#cbd5e1" : s.color }}
            />
            <span className={off ? "line-through" : ""}>{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// =====================================================================
// Function plot — sample exprs over xRange, reuse Chart.
// =====================================================================

function FunctionPlot({
  spec,
  onSelect,
}: {
  spec: FunctionPlotSpec;
  onSelect: SelectFn;
}) {
  const samples = spec.samples ?? 200;
  const [a, b] = spec.xRange;
  const series = spec.functions.map((fn) => {
    const points: ChartPoint[] = [];
    let f: ((x: number) => number) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      f = new Function("Math", "x", `return (${fn.expr});`).bind(
        null,
        Math,
      ) as (x: number) => number;
    } catch {
      f = null;
    }
    if (f) {
      for (let i = 0; i <= samples; i++) {
        const x = a + ((b - a) * i) / samples;
        let y: number;
        try {
          y = f(x);
        } catch {
          y = NaN;
        }
        if (Number.isFinite(y)) {
          points.push({
            x,
            y,
            note: fn.description,
            label: `${fn.name}(${x.toFixed(2)}) = ${y.toFixed(3)}`,
          });
        }
      }
    }
    return { name: fn.name, points };
  });

  return (
    <Chart
      spec={{
        type: "chart",
        kind: "line",
        title: spec.title,
        xLabel: spec.xLabel,
        yLabel: spec.yLabel,
        series,
      }}
      onSelect={onSelect}
    />
  );
}

// =====================================================================
// Scatter — points + optional simple linear regression line.
// =====================================================================

function Scatter({
  spec,
  onSelect,
}: {
  spec: ScatterSpec;
  onSelect: SelectFn;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 680;
    const height = 340;
    const margin = { top: 16, right: 24, bottom: 44, left: 56 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const visible = spec.series.filter((s) => !hidden.has(s.name));
    const allPoints = visible.flatMap((s) => s.points);
    if (allPoints.length === 0) return;

    const xExtent = d3.extent(allPoints, (p) => p.x) as [number, number];
    const yExtent = d3.extent(allPoints, (p) => p.y) as [number, number];
    const xPad = (xExtent[1] - xExtent[0] || 1) * 0.05;
    const yPad = (yExtent[1] - yExtent[0] || 1) * 0.1;

    const x = d3
      .scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6));
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(6));

    if (spec.xLabel) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.xLabel);
    }
    if (spec.yLabel) {
      svg
        .append("text")
        .attr("x", -(height / 2))
        .attr("y", 14)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.yLabel);
    }

    visible.forEach((s) => {
      const idx = spec.series.findIndex((x) => x.name === s.name);
      const c = PALETTE[idx % PALETTE.length];

      svg
        .append("g")
        .selectAll("circle")
        .data(s.points)
        .join("circle")
        .attr("cx", (p) => x(p.x))
        .attr("cy", (p) => y(p.y))
        .attr("r", 4)
        .attr("fill", c)
        .attr("opacity", 0.7)
        .style("cursor", "pointer")
        .on("mouseover", function () {
          d3.select(this).attr("r", 7).attr("opacity", 1);
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 4).attr("opacity", 0.7);
        })
        .on("click", (_e, p) =>
          onSelect({
            label: p.label || `${s.name}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
            description: p.note,
          }),
        )
        .append("title")
        .text(
          (p) =>
            `${s.name}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)})${
              p.note ? "\n" + p.note : ""
            }`,
        );

      if (spec.trendline && s.points.length >= 2) {
        const n = s.points.length;
        const sx = d3.sum(s.points, (p) => p.x);
        const sy = d3.sum(s.points, (p) => p.y);
        const sxx = d3.sum(s.points, (p) => p.x * p.x);
        const sxy = d3.sum(s.points, (p) => p.x * p.y);
        const denom = n * sxx - sx * sx;
        if (denom !== 0) {
          const slope = (n * sxy - sx * sy) / denom;
          const intercept = (sy - slope * sx) / n;
          const x0 = xExtent[0];
          const x1 = xExtent[1];
          svg
            .append("line")
            .attr("x1", x(x0))
            .attr("y1", y(intercept + slope * x0))
            .attr("x2", x(x1))
            .attr("y2", y(intercept + slope * x1))
            .attr("stroke", c)
            .attr("stroke-dasharray", "4 4")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.6);
        }
      }
    });
  }, [spec, hidden, onSelect]);

  return (
    <div className="space-y-2">
      <svg ref={ref} className="w-full" style={{ minHeight: 340 }} />
      {spec.series.length > 1 && (
        <Legend
          series={spec.series.map((s, i) => ({
            name: s.name,
            color: PALETTE[i % PALETTE.length],
          }))}
          hidden={hidden}
          onToggle={(name) => {
            setHidden((prev) => {
              const next = new Set(prev);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Histogram — pre-binned bar chart with click-for-note.
// =====================================================================

function Histogram({
  spec,
  onSelect,
}: {
  spec: HistogramSpec;
  onSelect: SelectFn;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 680;
    const height = 320;
    const margin = { top: 16, right: 24, bottom: 44, left: 56 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (spec.bins.length === 0) return;

    const xExtent = [
      d3.min(spec.bins, (b) => b.x0)!,
      d3.max(spec.bins, (b) => b.x1)!,
    ];
    const yMax = d3.max(spec.bins, (b) => b.count) || 1;

    const x = d3
      .scaleLinear()
      .domain(xExtent as [number, number])
      .range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6));
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(6));

    if (spec.xLabel) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.xLabel);
    }
    if (spec.yLabel) {
      svg
        .append("text")
        .attr("x", -(height / 2))
        .attr("y", 14)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#475569")
        .text(spec.yLabel);
    }

    svg
      .append("g")
      .selectAll("rect")
      .data(spec.bins)
      .join("rect")
      .attr("x", (b) => x(b.x0) + 1)
      .attr("y", (b) => y(b.count))
      .attr("width", (b) => Math.max(0, x(b.x1) - x(b.x0) - 2))
      .attr("height", (b) => y(0) - y(b.count))
      .attr("fill", PALETTE[0])
      .attr("opacity", 0.85)
      .style("cursor", "pointer")
      .on("mouseover", function () {
        d3.select(this).attr("opacity", 1);
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", 0.85);
      })
      .on("click", (_e, b) =>
        onSelect({
          label: `[${b.x0}, ${b.x1}) — count ${b.count}`,
          description: b.note,
        }),
      )
      .append("title")
      .text(
        (b) =>
          `[${b.x0}, ${b.x1}) — count ${b.count}${
            b.note ? "\n" + b.note : ""
          }`,
      );
  }, [spec, onSelect]);

  return <svg ref={ref} className="w-full" style={{ minHeight: 320 }} />;
}

// =====================================================================
// Timeline — clickable event list.
// =====================================================================

function Timeline({
  spec,
  onSelect,
}: {
  spec: TimelineSpec;
  onSelect: SelectFn;
}) {
  return (
    <ol className="relative ml-4 border-l-2 border-blue-200 pl-6">
      {spec.events.map((ev, i) => (
        <li key={i} className="mb-5 last:mb-0">
          <span
            className="absolute -left-2 mt-1.5 block h-3 w-3 rounded-full bg-blue-500"
            aria-hidden
          />
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            {ev.when}
          </div>
          <button
            type="button"
            className="text-left text-sm font-medium text-gray-900 hover:underline"
            onClick={() =>
              onSelect({
                label: `${ev.when} — ${ev.label}`,
                description: ev.description || ev.detail,
              })
            }
          >
            {ev.label}
          </button>
          {ev.detail && (
            <div className="mt-0.5 text-sm text-gray-600">{ev.detail}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

// =====================================================================
// Tree — hierarchical (recursion / decision / AST). Pan + zoom + click.
// =====================================================================

function Tree({ spec, onSelect }: { spec: TreeSpec; onSelect: SelectFn }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select<SVGSVGElement, unknown>(ref.current);
    svg.selectAll("*").remove();

    const width = 720;
    const height = 420;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const root = d3.hierarchy(spec.root, (d) => d.children);
    const horizontal = spec.orientation === "horizontal";

    const layout = horizontal
      ? d3.tree<TreeNode>().size([height - 40, width - 200])
      : d3.tree<TreeNode>().size([width - 40, height - 80]);
    layout(root);

    const g = svg
      .append("g")
      .attr(
        "transform",
        horizontal ? "translate(80, 20)" : "translate(20, 40)",
      );

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on("zoom", (e) => g.attr("transform", e.transform.toString()));
    svg.call(zoom);

    const linkGen = horizontal
      ? d3
          .linkHorizontal<
            d3.HierarchyPointLink<TreeNode>,
            d3.HierarchyPointNode<TreeNode>
          >()
          .x((d) => d.y)
          .y((d) => d.x)
      : d3
          .linkVertical<
            d3.HierarchyPointLink<TreeNode>,
            d3.HierarchyPointNode<TreeNode>
          >()
          .x((d) => d.x)
          .y((d) => d.y);

    g.append("g")
      .attr("fill", "none")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .selectAll("path")
      .data(root.links() as d3.HierarchyPointLink<TreeNode>[])
      .join("path")
      .attr("d", linkGen as unknown as (d: d3.HierarchyPointLink<TreeNode>) => string);

    const nodeG = g
      .append("g")
      .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>("g")
      .data(root.descendants() as d3.HierarchyPointNode<TreeNode>[])
      .join<SVGGElement>("g")
      .attr("transform", (d) =>
        horizontal ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`,
      )
      .style("cursor", "pointer")
      .on("click", (_e, d) =>
        onSelect({
          id: d.data.id,
          label: d.data.label,
          description: d.data.description,
        }),
      );

    nodeG
      .append("rect")
      .attr("x", -40)
      .attr("y", -14)
      .attr("width", 80)
      .attr("height", 28)
      .attr("rx", 6)
      .attr("fill", "#eff6ff")
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 1.4)
      .on("mouseover", function () {
        d3.select(this).attr("fill", "#dbeafe");
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill", "#eff6ff");
      });

    nodeG
      .append("text")
      .text((d) => d.data.label)
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 11)
      .attr("fill", "#1e3a8a")
      .attr("pointer-events", "none");

    nodeG.append("title").text((d) =>
      d.data.description
        ? `${d.data.label}\n\n${d.data.description}`
        : d.data.label,
    );
  }, [spec, onSelect]);

  return (
    <div className="space-y-1">
      <svg ref={ref} className="w-full" style={{ minHeight: 420 }} />
      <p className="text-[11px] text-slate-400">
        Scroll to zoom · drag to pan · click a node for detail
      </p>
    </div>
  );
}

// =====================================================================
// Flowchart — layered DAG (start → steps → end). Interactive.
// =====================================================================

function Flowchart({
  spec,
  onSelect,
}: {
  spec: FlowchartSpec;
  onSelect: SelectFn;
}) {
  const ref = useRef<SVGSVGElement>(null);

  // Compute a simple layered layout: BFS depths from any "start"-like nodes.
  const layout = useMemo(() => {
    const nodes = spec.nodes;
    const edges = spec.edges;
    const incoming = new Map<string, number>();
    nodes.forEach((n) => incoming.set(n.id, 0));
    edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) || 0) + 1));
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => adj.set(n.id, []));
    edges.forEach((e) => adj.get(e.source)?.push(e.target));

    const depth = new Map<string, number>();
    const queue: string[] = [];
    nodes.forEach((n) => {
      if ((incoming.get(n.id) || 0) === 0) {
        depth.set(n.id, 0);
        queue.push(n.id);
      }
    });
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj.get(u) || []) {
        const next = (depth.get(u) || 0) + 1;
        if (next > (depth.get(v) || -1)) {
          depth.set(v, next);
          queue.push(v);
        }
      }
    }
    nodes.forEach((n) => {
      if (!depth.has(n.id)) depth.set(n.id, 0);
    });

    const layers = new Map<number, string[]>();
    for (const [id, d] of depth.entries()) {
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }

    return { depth, layers };
  }, [spec]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const horizontal = spec.orientation !== "vertical";
    const layerCount = Math.max(...Array.from(layout.layers.keys())) + 1;
    const maxInLayer = Math.max(
      ...Array.from(layout.layers.values()).map((arr) => arr.length),
    );

    const NODE_W = 140;
    const NODE_H = 50;
    const X_GAP = 60;
    const Y_GAP = 30;

    const width = horizontal
      ? Math.max(720, layerCount * (NODE_W + X_GAP) + 60)
      : Math.max(420, maxInLayer * (NODE_W + X_GAP) + 40);
    const height = horizontal
      ? Math.max(280, maxInLayer * (NODE_H + Y_GAP) + 40)
      : Math.max(360, layerCount * (NODE_H + Y_GAP) + 40);

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const positions = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of layout.layers.entries()) {
      ids.forEach((id, i) => {
        if (horizontal) {
          positions.set(id, {
            x: 30 + d * (NODE_W + X_GAP) + NODE_W / 2,
            y:
              (height - ids.length * (NODE_H + Y_GAP)) / 2 +
              i * (NODE_H + Y_GAP) +
              NODE_H / 2,
          });
        } else {
          positions.set(id, {
            x:
              (width - ids.length * (NODE_W + X_GAP)) / 2 +
              i * (NODE_W + X_GAP) +
              NODE_W / 2,
            y: 30 + d * (NODE_H + Y_GAP) + NODE_H / 2,
          });
        }
      });
    }

    svg
      .append("defs")
      .append("marker")
      .attr("id", "fc-arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M0,0 L10,5 L0,10 z")
      .attr("fill", "#94a3b8");

    svg
      .append("g")
      .selectAll("path")
      .data(spec.edges)
      .join("path")
      .attr("d", (e) => {
        const s = positions.get(e.source);
        const t = positions.get(e.target);
        if (!s || !t) return "";
        return `M${s.x},${s.y} L${t.x},${t.y}`;
      })
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("fill", "none")
      .attr("marker-end", "url(#fc-arrow)");

    const fillFor = (
      kind: "start" | "step" | "decision" | "end" | undefined,
    ) => {
      switch (kind) {
        case "start":
          return { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d" };
        case "end":
          return { fill: "#fee2e2", stroke: "#dc2626", text: "#7f1d1d" };
        case "decision":
          return { fill: "#fef3c7", stroke: "#d97706", text: "#78350f" };
        default:
          return { fill: "#eff6ff", stroke: "#2563eb", text: "#1e3a8a" };
      }
    };

    const g = svg
      .append("g")
      .selectAll<SVGGElement, (typeof spec.nodes)[number]>("g")
      .data(spec.nodes)
      .join<SVGGElement>("g")
      .attr("transform", (n) => {
        const p = positions.get(n.id)!;
        return `translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`;
      })
      .style("cursor", "pointer")
      .on("click", (_e, n) =>
        onSelect({
          id: n.id,
          label: n.label,
          description: n.description,
        }),
      );

    g.append("rect")
      .attr("width", NODE_W)
      .attr("height", NODE_H)
      .attr("rx", (n) => (n.kind === "decision" ? 24 : 8))
      .attr("fill", (n) => fillFor(n.kind).fill)
      .attr("stroke", (n) => fillFor(n.kind).stroke)
      .attr("stroke-width", 1.4);

    g.append("text")
      .attr("x", NODE_W / 2)
      .attr("y", NODE_H / 2 + 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("fill", (n) => fillFor(n.kind).text)
      .attr("pointer-events", "none")
      .text((n) =>
        n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label,
      );

    g.append("title").text((n) =>
      n.description ? `${n.label}\n\n${n.description}` : n.label,
    );
  }, [spec, layout, onSelect]);

  return <svg ref={ref} className="w-full" style={{ minHeight: 320 }} />;
}

// =====================================================================
// Table — sortable, clickable rows. _note as detail.
// =====================================================================

function Table({ spec, onSelect }: { spec: TableSpec; onSelect: SelectFn }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return spec.rows;
    const copy = [...spec.rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return asc ? av - bv : bv - av;
      }
      return asc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [spec.rows, sortKey, asc]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {spec.columns.map((c) => (
              <th
                key={c.key}
                className="cursor-pointer px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  if (sortKey === c.key) setAsc(!asc);
                  else {
                    setSortKey(c.key);
                    setAsc(true);
                  }
                }}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="ml-1 text-slate-400">
                    {asc ? "↑" : "↓"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40"
              onClick={() => {
                const note = row._note;
                if (note != null) {
                  onSelect({
                    label: spec.columns
                      .map((c) => `${c.label}: ${row[c.key] ?? ""}`)
                      .join(" · "),
                    description: String(note),
                  });
                }
              }}
            >
              {spec.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-700">
                  {row[c.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
