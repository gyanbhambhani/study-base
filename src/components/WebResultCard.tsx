"use client";

import { ExternalLink, Globe } from "lucide-react";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export function WebResultCard({ result }: { result: WebResult }) {
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-cyan-100">
          <Globe className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold text-gray-900 group-hover:text-emerald-700">
            {result.title}
          </div>
          {result.source && (
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {result.source}
            </div>
          )}
          {result.snippet && (
            <p className="mt-2 line-clamp-3 text-xs text-gray-600">
              {result.snippet}
            </p>
          )}
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            Open
            <ExternalLink className="h-3 w-3" />
          </div>
        </div>
      </div>
    </a>
  );
}
