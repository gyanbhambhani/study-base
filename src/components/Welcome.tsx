"use client";

import { ReactNode } from "react";

interface Suggestion {
  course: string;
  title: string;
  body: string;
  capability: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    course: "PHYS 8B",
    title: "Walk me through Gauss's law",
    body: "with a worked example for a charged sphere",
    capability: "math + worked example",
    prompt:
      "Walk me through Gauss's law for Physics 8B. Cover intuition, the " +
      "integral form, and a fully worked example for a uniformly charged " +
      "solid sphere with the field both inside and outside.",
  },
  {
    course: "CS 61A",
    title: "Recursion tree for fib(5)",
    body: "and what makes naive recursion exponential",
    capability: "interactive tree",
    prompt:
      "Draw the recursion tree for fib(5) as an interactive diagram, " +
      "explain what each node returns and why the time complexity is " +
      "O(2^n). Then show how memoization changes the tree.",
  },
  {
    course: "CS 61B",
    title: "Compare the sorting algorithms",
    body: "in a sortable table with edge cases",
    capability: "sortable table",
    prompt:
      "Compare the major sorting algorithms (quicksort, mergesort, heapsort, " +
      "insertion sort, radix sort) in a sortable table. For each: average " +
      "and worst time, space, stability, and the case where you'd actually " +
      "choose it.",
  },
  {
    course: "ECON 1",
    title: "Supply and demand from first principles",
    body: "and pull past midterm questions on the topic",
    capability: "library + diagram",
    prompt:
      "Explain supply and demand from first principles for Econ 1. Include " +
      "an interactive curve showing the equilibrium shift when demand " +
      "increases, and pull any past Berkeley midterm questions on the " +
      "topic from the StudyBase library.",
  },
];

export function Welcome({
  onPick,
  composer,
}: {
  onPick: (text: string) => void;
  composer: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4">
      {/* Headline */}
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          BETA · UC BERKELEY
        </div>
        <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
          Berkeley coursework,
          <br />
          <span className="text-slate-500">taught back at you.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
          A study tutor that actually shows its work. Textbook-quality
          explanations with LaTeX math, click-to-explore D3 diagrams, and
          real past exams from the StudyBase archive when they help.
        </p>
      </div>

      {/* Composer */}
      <div className="mb-8">{composer}</div>

      {/* Curated starts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Try one of these
          </span>
          <span className="text-[11px] text-slate-400">
            click to drop into the composer
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <li key={s.title}>
              <button
                onClick={() => onPick(s.prompt)}
                className="group flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-slate-900 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white">
                    {s.course}
                  </span>
                  <span className="text-[10px] text-slate-400 group-hover:text-slate-600">
                    {s.capability}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {s.title}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{s.body}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer stats */}
      <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>
          <strong className="font-semibold text-slate-600">288</strong>{" "}
          Berkeley courses indexed
        </span>
        <span className="hidden sm:inline">·</span>
        <span>thousands of past exams</span>
        <span className="hidden sm:inline">·</span>
        <span>LaTeX · D3 · streaming</span>
        <span className="hidden sm:inline">·</span>
        <span>
          built by{" "}
          <a
            className="underline hover:text-slate-700"
            href="https://www.linkedin.com/in/gyanbhambhani"
          >
            gyan
          </a>{" "}
          &amp;{" "}
          <a
            className="underline hover:text-slate-700"
            href="https://www.linkedin.com/in/aarushi-thaker-77a074207/"
          >
            aarushi
          </a>
        </span>
      </div>
    </div>
  );
}
