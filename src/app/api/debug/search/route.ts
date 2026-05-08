import { NextRequest, NextResponse } from "next/server";
import {
  findCandidateResources,
  scoreCourseId,
} from "@/lib/resourceSearch";
import { db } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/debug/search?q=physics+8B
// Returns the raw search trace so you can see what's being matched and why.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q) {
    return NextResponse.json({
      error: "Pass ?q=<query>",
      hint: "e.g. /api/debug/search?q=physics+8B",
    });
  }

  const coursesSnap = await db.collection("courses").get();
  const allIds = coursesSnap.docs.map((d) => d.id);
  const scored = allIds
    .map((id) => ({ id, score: scoreCourseId(id, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const resources = await findCandidateResources(q, [], 10, 30);

  return NextResponse.json({
    query: q,
    totalCourses: allIds.length,
    topScoredCourses: scored,
    resourceCount: resources.length,
    resources: resources.slice(0, 10).map((r) => ({
      course: r.course_code,
      type: r.resource_type,
      semester: r.semester,
      year: r.year,
      url: r.resource_url,
    })),
  });
}
