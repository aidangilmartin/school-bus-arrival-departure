// POST /api/auth  (Authorization: Bearer <google_id_token>)
// Verifies the Google sign-in and reports the caller's role. Used by the
// client to decide whether to show admin controls (server still enforces).
import { verifyGoogleToken, bearer, isAdminEmail, isOwnerEmail } from "../lib/auth.mjs";

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export default async (req) => {
  const user = await verifyGoogleToken(bearer(req));
  if (!user) {
    return Response.json({ signedIn: false, isAdmin: false, isOwner: false }, { headers: HEADERS });
  }
  const isOwner = isOwnerEmail(user.email);
  const isAdmin = isOwner || (await isAdminEmail(user.email));
  return Response.json(
    { signedIn: true, isAdmin, isOwner, email: user.email, name: user.name, picture: user.picture },
    { headers: HEADERS },
  );
};

export const config = { path: "/api/auth" };
