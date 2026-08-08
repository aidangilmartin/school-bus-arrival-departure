// Manage the teacher whitelist. Admins only.
// GET  /api/admins            -> { admins: [...editable], bootstrap: [...locked], me }
// POST /api/admins {action:"add"|"remove", email}
import { boardStore, requireAdmin, listAdmins, setStoredAdmins } from "../lib/auth.mjs";

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req) => {
  const store = boardStore();
  const admin = await requireAdmin(req, store);
  if (!admin) {
    return Response.json({ error: "not authorized" }, { status: 403, headers: HEADERS });
  }

  if (req.method === "GET") {
    const { stored, bootstrap } = await listAdmins(store);
    return Response.json({ admins: stored, bootstrap, me: admin.email }, { headers: HEADERS });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400, headers: HEADERS });
    }
    const email = String(body.email || "").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "invalid email" }, { status: 400, headers: HEADERS });
    }
    const { stored, bootstrap } = await listAdmins(store);

    let next;
    if (body.action === "add") {
      next = [...stored, email];
    } else if (body.action === "remove") {
      if (bootstrap.includes(email)) {
        return Response.json(
          { error: "that account is a permanent admin and can't be removed here" },
          { status: 400, headers: HEADERS },
        );
      }
      next = stored.filter((e) => e !== email);
    } else {
      return Response.json({ error: "unknown action" }, { status: 400, headers: HEADERS });
    }

    const saved = await setStoredAdmins(store, next);
    return Response.json({ admins: saved, bootstrap, me: admin.email }, { headers: HEADERS });
  }

  return Response.json({ error: "method not allowed" }, { status: 405, headers: HEADERS });
};

export const config = { path: "/api/admins" };
