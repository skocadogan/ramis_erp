import { getRuntimeConfigPayloadForClient } from "@/lib/runtimeConfig.server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(request: Request) {
  const appOrigin = new URL(request.url).origin;
  const cfg = getRuntimeConfigPayloadForClient(appOrigin);
  if (!cfg) {
    return Response.json({ error: "runtime_config_unavailable" }, { status: 503 });
  }

  return Response.json(cfg, { headers: NO_STORE_HEADERS });
}
