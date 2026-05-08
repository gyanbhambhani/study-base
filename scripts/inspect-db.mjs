// One-off DB inspection. Run: node --env-file=.env.local scripts/inspect-db.mjs
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const cols = await db.listCollections();
console.log("ROOT COLLECTIONS:", cols.map((c) => c.id));

const coursesSnap = await db.collection("courses").get();
console.log("\nTOTAL courses docs:", coursesSnap.size);
const ids = coursesSnap.docs.map((d) => d.id);
console.log("\nFIRST 30 course IDs:");
console.log(ids.slice(0, 30).join("\n"));

if (coursesSnap.size > 0) {
  const sample = coursesSnap.docs[0];
  console.log("\nSAMPLE course doc id:", sample.id);
  console.log("SAMPLE course data:", JSON.stringify(sample.data(), null, 2));
  const subs = await sample.ref.listCollections();
  console.log("SAMPLE subcollections:", subs.map((s) => s.id));
  for (const sub of subs) {
    const ss = await sub.get();
    console.log(`  sub "${sub.id}" has ${ss.size} docs`);
    if (ss.size > 0) {
      console.log("  first doc id:", ss.docs[0].id);
      console.log("  first doc data:", JSON.stringify(ss.docs[0].data(), null, 2));
    }
  }
}

const csLike = ids.filter((i) => /cs/i.test(i)).slice(0, 20);
console.log("\nCS-ish course IDs:", csLike);
const physLike = ids.filter((i) => /phys/i.test(i)).slice(0, 20);
console.log("Phys-ish course IDs:", physLike);
const econLike = ids.filter((i) => /econ/i.test(i)).slice(0, 20);
console.log("Econ-ish course IDs:", econLike);

process.exit(0);
