import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Lazy init so a missing/invalid GOOGLE_CREDENTIALS_JSON doesn't blow up
// `next build`'s "collect page data" step (which evaluates route modules).
// We only fail when the DB is actually used at request time.

let _app: App | null = null;
let _db: Firestore | null = null;

function ensureApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0]!;
    return _app;
  }
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("GOOGLE_CREDENTIALS_JSON env var is not set");
  }
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse GOOGLE_CREDENTIALS_JSON:", e);
    throw e;
  }
  _app = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });
  return _app;
}

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    if (!_db) _db = getFirestore(ensureApp());
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});
