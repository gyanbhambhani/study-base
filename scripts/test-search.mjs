// Tiny sanity check for the new course-id scorer + retrieval, hitting
// the real Firestore. Run: node --env-file=.env.local scripts/test-search.mjs
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokenize = (s) =>
  s.toLowerCase().match(/[a-z0-9]+/g)?.filter(Boolean) || [];
const adjacentJoins = (toks) => {
  const out = [];
  for (let i = 0; i < toks.length - 1; i++) out.push(toks[i] + toks[i + 1]);
  return out;
};

function scoreCourseId(courseId, query) {
  const idFlat = flat(courseId);
  const idTokens = courseId.split(/[_\-\s]+/).map((t) => t.toLowerCase()).filter(Boolean);
  const qFlat = flat(query);
  const qTokens = tokenize(query);
  const qPairs = adjacentJoins(qTokens);
  let score = 0;
  if (idFlat.length >= 3 && qFlat.includes(idFlat)) score += 8;
  for (const pair of qPairs) if (pair === idFlat) score += 10;
  for (const qt of qTokens) {
    if (idTokens.includes(qt)) score += 3;
    else if (qt.length >= 3 && idFlat.includes(qt)) score += 1;
  }
  if (idTokens.length > 0 && idTokens.every((t) => t.length >= 2 && qFlat.includes(t))) score += 2;
  return score;
}

const snap = await db.collection("courses").get();
const ids = snap.docs.map((d) => d.id);
console.log("courses:", ids.length);

const queries = [
  "Physics 8B electromagnetic waves midterm",
  "CS 61B past finals",
  "Econ 101A practice problems",
  "BioE 131",
  "physics8B",
  "supply and demand", // intentionally code-less
];

for (const q of queries) {
  const top = ids
    .map((id) => ({ id, s: scoreCourseId(id, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  console.log(`\nQ: ${q}`);
  console.log("  top:", top.map((r) => `${r.id}:${r.s}`).join(", ") || "(none)");
  if (top.length > 0) {
    const exams = await snap.docs
      .find((d) => d.id === top[0].id)
      .ref.collection("exams")
      .limit(3)
      .get();
    console.log(`  ${top[0].id} has ${exams.size} sample exams`);
    exams.docs.forEach((e) => {
      const d = e.data();
      console.log(`    - ${d.resource_type || "?"} ${d.semester || ""} ${d.year || ""}`);
    });
  }
}
process.exit(0);
