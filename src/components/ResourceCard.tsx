"use client";

import {
  ExternalLink,
  FileText,
  Calendar,
  User,
  School,
  Sparkles,
} from "lucide-react";

export interface Resource {
  id: string;
  course_code: string;
  course_name?: string;
  department?: string;
  semester?: string;
  year?: string;
  resource_type?: string;
  resource_url?: string;
  school?: string;
  metadata?: {
    instructor?: string;
    source?: string;
    [k: string]: unknown;
  };
  relevance?: number;
  why?: string;
}

export function ResourceCard({ resource }: { resource: Resource }) {
  const pct =
    typeof resource.relevance === "number"
      ? Math.round(resource.relevance * 100)
      : null;

  return (
    <a
      href={resource.resource_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-purple-100">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
              {resource.course_code}
            </div>
            {resource.course_name && (
              <div className="truncate text-xs text-gray-500">
                {resource.course_name}
              </div>
            )}
          </div>
        </div>
        {pct !== null && (
          <div
            className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
            title="Relevance to your question"
          >
            <Sparkles className="h-3 w-3" />
            {pct}%
          </div>
        )}
      </div>

      {resource.why && (
        <p className="mt-2 text-xs italic text-gray-600">“{resource.why}”</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        {resource.resource_type && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
            {resource.resource_type}
          </span>
        )}
        {(resource.semester || resource.year) && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {[resource.semester, resource.year].filter(Boolean).join(" ")}
          </span>
        )}
        {resource.metadata?.instructor && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {resource.metadata.instructor}
          </span>
        )}
        {resource.school && (
          <span className="inline-flex items-center gap-1">
            <School className="h-3 w-3" />
            {resource.school}
          </span>
        )}
      </div>

      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
        Open resource
        <ExternalLink className="h-3 w-3" />
      </div>
    </a>
  );
}
