// Shared auth helpers for the Netlify functions.
// Admin identity = a verified Google account whose email is whitelisted.
// The whitelist = bootstrap emails (env, always admin) + a stored list in
// Netlify Blobs that admins can edit in the app.
import { getStore } from "@netlify/blobs";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const BOOTSTRAP = (process.env.ADMIN_BOOTSTRAP_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ADMINS_KEY = "admins";

export function boardStore() {
  // Strong consistency so each read sees the previous write.
  return getStore({ name: "bus-board", consistency: "strong" });
}

// Verify a Google ID token via Google's tokeninfo endpoint and enforce that
// it was issued for THIS app (aud) and has a verified email.
export async function verifyGoogleToken(idToken) {
  if (!idToken || !CLIENT_ID) return null;
  let res;
  try {
    res = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let p;
  try {
    p = await res.json();
  } catch {
    return null;
  }
  if (p.aud !== CLIENT_ID) return null;
  if (p.iss !== "accounts.google.com" && p.iss !== "https://accounts.google.com") return null;
  const verified = p.email_verified === true || p.email_verified === "true";
  if (!verified || !p.email) return null;
  if (p.exp && Number(p.exp) * 1000 < Date.now()) return null;
  return { email: String(p.email).toLowerCase(), name: p.name || "", picture: p.picture || "" };
}

export function bearer(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function listAdmins(store) {
  store = store || boardStore();
  const raw = await store.get(ADMINS_KEY, { type: "json", consistency: "strong" });
  const stored = Array.isArray(raw) ? raw.map((e) => String(e).toLowerCase()) : [];
  const all = [...new Set([...BOOTSTRAP, ...stored])];
  return { all, stored, bootstrap: BOOTSTRAP };
}

export async function isAdminEmail(email, store) {
  if (!email) return false;
  const { all } = await listAdmins(store);
  return all.includes(String(email).toLowerCase());
}

export async function setStoredAdmins(store, emails) {
  store = store || boardStore();
  const clean = [
    ...new Set(emails.map((e) => String(e).toLowerCase().trim()).filter(Boolean)),
  ];
  await store.setJSON(ADMINS_KEY, clean);
  return clean;
}

// Returns the verified admin user ({ email, name, picture }) or null.
export async function requireAdmin(req, store) {
  const user = await verifyGoogleToken(bearer(req));
  if (!user) return null;
  return (await isAdminEmail(user.email, store)) ? user : null;
}
