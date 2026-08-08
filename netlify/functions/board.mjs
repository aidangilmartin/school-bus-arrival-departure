// Shared bus-board state for the hosted (Netlify) site.
// GET  /api/board        -> current board state (JSON). Public (student view).
// POST /api/board {event, payload} -> apply one action. Admins only: requires
//   a whitelisted Google account (Authorization: Bearer <id_token>).
// State lives in Netlify Blobs so every device shares one board.
import BusState from "../../public/js/state.js";
import { boardStore, requireAdmin } from "../lib/auth.mjs";

const KEY = "state";
const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

async function loadState(store) {
  const res = await store.getWithMetadata(KEY, { type: "json" });
  if (res && res.data) {
    return { state: BusState.normalize(res.data), etag: res.etag };
  }
  return { state: BusState.defaultState(), etag: null };
}

export default async (req) => {
  const store = boardStore();

  if (req.method === "GET") {
    const { state } = await loadState(store);
    return Response.json(state, { headers: HEADERS });
  }

  if (req.method === "POST") {
    // Only whitelisted Google accounts may change the board.
    const admin = await requireAdmin(req, store);
    if (!admin) {
      return Response.json({ error: "not authorized" }, { status: 403, headers: HEADERS });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400, headers: HEADERS });
    }
    const mutate = BusState.actions[body.event];
    if (!mutate) {
      return Response.json({ error: "unknown action" }, { status: 400, headers: HEADERS });
    }

    // Read-modify-write, guarded by an etag compare-and-set so simultaneous
    // updates from two devices don't clobber each other. After a few lost
    // races we force the write (last-write-wins) so a request never fails —
    // this also covers environments where conditional writes aren't honored.
    const MAX = 5;
    for (let attempt = 0; attempt < MAX; attempt++) {
      const { state, etag } = await loadState(store);
      const changed = mutate(state, body.payload || {});
      if (!changed) return Response.json(state, { headers: HEADERS });

      const force = attempt === MAX - 1;
      let opts = {};
      if (!force) opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };

      let result;
      try {
        result = await store.setJSON(KEY, state, opts);
      } catch {
        continue; // transient write error → retry
      }
      if (!force && result && result.modified === false) continue; // lost the race → retry
      return Response.json(state, { headers: HEADERS });
    }
    return Response.json({ error: "write conflict, please retry" }, { status: 409, headers: HEADERS });
  }

  return Response.json({ error: "method not allowed" }, { status: 405, headers: HEADERS });
};

// Declarative routing (Netlify Functions v2) — no redirect rule needed.
export const config = { path: "/api/board" };
