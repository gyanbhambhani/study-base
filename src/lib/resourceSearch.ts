import type OpenAI from "openai";
import { db } from "@/lib/firebase-admin";

export interface CourseResource {
  id: string;
  course_code: string;
  course_name: string;
  department: string;
  semester: string;
  year: string;
  resource_type: string;
  resource_url: string;
  school: string;
  metadata: {
    instructor?: string;
    resource_type?: string;
    source?: string;
    department?: string;
    [k: string]: unknown;
  };
  parent_course_id?: string;
  collection_path?: string;
  // Filled in by re-ranker, 0..1.
  relevance?: number;
  why?: string;
}

// Lower-case, alphanumeric-only.
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Tokenize on whitespace and common separators. Keeps things like "8b" intact.
function tokenize(s: string): string[] {
  return (
    s
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((t) => t.length > 0) || []
  );
}

// Adjacent token pairs joined: ["physics","8b","mid"] -> ["physics8b","8bmid"]
function adjacentJoins(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(tokens[i] + tokens[i + 1]);
  }
  return out;
}

// Score how well a course doc-id matches a query string.
// Doc ids look like "Physics_8B", "CS_61B", "Econ_101A".
// Approach: score by token overlap + concatenated form + substring fallback.
export function scoreCourseId(courseId: string, query: string): number {
  const idFlat = flat(courseId);
  const idTokens = courseId
    .split(/[_\-\s]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);

  const qFlat = flat(query);
  const qTokens = tokenize(query);
  const qPairs = adjacentJoins(qTokens);

  let score = 0;

  // Strong: the entire flat id appears verbatim somewhere in the query
  // ("physics8b" inside "physics 8b midterms" -> qFlat contains it).
  if (idFlat.length >= 3 && qFlat.includes(idFlat)) score += 8;

  // Very strong: any adjacent query-token pair concatenated equals the
  // flat id. Catches "Physics 8B" -> "physics8b" -> id "Physics_8B".
  for (const pair of qPairs) {
    if (pair === idFlat) score += 10;
  }

  // Token-level matches against the id's underscore-split tokens.
  for (const qt of qTokens) {
    if (idTokens.includes(qt)) score += 3;
    else if (qt.length >= 3 && idFlat.includes(qt)) score += 1;
  }

  // Bonus: every id token appears somewhere in the query's flat form.
  // (Cheap way to reward complete matches.)
  if (
    idTokens.length > 0 &&
    idTokens.every((t) => t.length >= 2 && qFlat.includes(t))
  ) {
    score += 2;
  }

  return score;
}

// Score an exam doc against the query using its actual stored fields.
// (Course docs themselves are basically empty in this DB, so we lean on
// per-exam metadata for any fine-grained matching.)
function scoreExamFields(
  data: Record<string, unknown>,
  qFlat: string,
  qTokens: string[],
): number {
  if (qTokens.length === 0) return 0;
  const fields = [
    data.course_code,
    data.course_name,
    data.department,
    data.resource_type,
    data.semester,
    data.year,
    (data.metadata as Record<string, unknown> | undefined)?.instructor,
    (data.metadata as Record<string, unknown> | undefined)?.source,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((s) => s.toLowerCase());

  const blob = fields.join(" ");
  const blobFlat = flat(blob);

  let s = 0;
  for (const t of qTokens) {
    if (t.length < 2) continue;
    if (blobFlat.includes(t)) s += 1;
  }
  if (qFlat.length >= 4 && blobFlat.includes(qFlat)) s += 4;
  return s;
}

// Top-level retrieval. Returns best-effort exam resources for a query.
// Strategy: score every course id against the query, take top N, walk each
// matched course's `exams` subcollection, optionally re-score exam-level
// fields, return de-duped top results.
export async function findCandidateResources(
  prompt: string,
  extraTerms: string[] = [],
  maxCourses = 10,
  maxResources = 30,
): Promise<CourseResource[]> {
  const fullQuery = [prompt, ...extraTerms].join(" ");
  const qFlat = flat(fullQuery);
  const qTokens = tokenize(fullQuery);

  console.log(
    "[resourceSearch] query:",
    JSON.stringify(prompt),
    "extraTerms:",
    extraTerms,
  );

  const coursesSnap = await db.collection("courses").get();
  const all = coursesSnap.docs;
  console.log("[resourceSearch] total courses:", all.length);

  // Score every course id; keep ones with any positive score.
  const scored = all
    .map((doc) => ({ doc, score: scoreCourseId(doc.id, fullQuery) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  console.log(
    "[resourceSearch] top course scores:",
    scored.slice(0, 8).map((r) => `${r.doc.id}:${r.score}`),
  );

  // If nothing scored, bail out empty rather than firing 288 sub-queries.
  if (scored.length === 0) {
    console.log("[resourceSearch] no course matched — returning empty");
    return [];
  }

  const matched = scored.slice(0, maxCourses).map((r) => r.doc);

  const all_resources: (CourseResource & { _score: number })[] = [];
  await Promise.all(
    matched.map(async (courseDoc) => {
      const examsSnap = await courseDoc.ref.collection("exams").get();
      examsSnap.docs.forEach((examDoc) => {
        const data = examDoc.data() || {};
        const courseScore =
          scored.find((s) => s.doc.id === courseDoc.id)?.score ?? 0;
        const examScore = scoreExamFields(data, qFlat, qTokens);
        const total = courseScore * 2 + examScore;
        all_resources.push({
          _score: total,
          id: examDoc.id,
          parent_course_id: courseDoc.id,
          collection_path: `courses/${courseDoc.id}/exams/${examDoc.id}`,
          course_code:
            (data.course_code as string) || courseDoc.id.replace(/_/g, " "),
          course_name: (data.course_name as string) || "",
          department: (data.department as string) || "",
          school: (data.school as string) || "",
          semester: (data.semester as string) || "",
          year: (data.year as string) || "",
          resource_type:
            (data.resource_type as string) ||
            ((data.metadata as Record<string, unknown> | undefined)
              ?.resource_type as string) ||
            "",
          resource_url: (data.resource_url as string) || "",
          metadata: (data.metadata as CourseResource["metadata"]) || {},
        });
      });
    }),
  );

  console.log(
    "[resourceSearch] gathered exams:",
    all_resources.length,
    "from",
    matched.length,
    "courses",
  );

  // Sort by combined score, then year desc as tiebreaker.
  all_resources.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return (b.year || "").localeCompare(a.year || "");
  });

  // Strip the internal _score field before returning.
  return all_resources.slice(0, maxResources).map((r) => {
    const { _score, ...rest } = r;
    void _score;
    return rest;
  });
}

// AI re-rank against the *actual* user question. Uses gpt-4o-mini cheaply.
export async function rerankResources(
  question: string,
  candidates: CourseResource[],
  openai: OpenAI,
  topK = 8,
): Promise<CourseResource[]> {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;

  const compact = candidates.map((r, i) => ({
    i,
    course: r.course_code,
    name: r.course_name,
    department: r.department,
    type: r.resource_type,
    semester: r.semester,
    year: r.year,
    instructor: r.metadata?.instructor || "",
  }));

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You re-rank academic study resources. Given a student's " +
            "question and a list of candidate resources, score each from " +
            "0..1 by how directly it would help the student answer or " +
            "study that question. Return JSON: {\"ranked\":[{\"i\":int," +
            "\"score\":float,\"why\":string}]}. Keep `why` <= 12 words.",
        },
        {
          role: "user",
          content: JSON.stringify({ question, candidates: compact }),
        },
      ],
    });

    const content = resp.choices[0].message.content || "{}";
    const parsed = JSON.parse(content) as {
      ranked?: { i: number; score: number; why?: string }[];
    };
    const ranked = parsed.ranked || [];
    const byIdx = new Map(ranked.map((r) => [r.i, r]));
    const out = candidates
      .map((c, i) => ({
        ...c,
        relevance: byIdx.get(i)?.score ?? 0,
        why: byIdx.get(i)?.why,
      }))
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, topK);
    return out;
  } catch (err) {
    console.warn("rerankResources failed, returning unranked:", err);
    return candidates.slice(0, topK);
  }
}
