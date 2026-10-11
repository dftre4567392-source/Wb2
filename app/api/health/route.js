export async function GET() {
  return Response.json(
    { ok: true, service: "si-base" },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
