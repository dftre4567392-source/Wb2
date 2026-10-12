import { authenticateRequest } from "../../../../lib/security.js";
import { getPlan, getRateLimit, storageMode } from "../../../../lib/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);

  const plan = auth.internal ? "MAX" : await getPlan(auth.user.id);
  return json({
    ok: true,
    user: auth.user,
    plan,
    requestsPerMinute: getRateLimit(plan),
    storage: storageMode()
  });
}
