import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { BuildOptions } from "esbuild";
import { createSerwistRoute } from "@serwist/turbopack";

const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
const revision =
  gitHead.status === 0 && gitHead.stdout?.trim() ? gitHead.stdout.trim() : randomUUID();

/** Build-time: yalnızca env (runtime dosyası build'de okunmaz — NFT uyarısı + fs client trace önlenir). */
let apiOrigin = "";
try {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) apiOrigin = new URL(raw).origin;
} catch {
  apiOrigin = "";
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    // Linux/macOS varsayılanı esbuild-wasm; native esbuild zaten kurulu.
    useNativeEsbuild: true,
    esbuildOptions: {
      define: {
        __RAMIS_API_ORIGIN__: JSON.stringify(apiOrigin),
      },
    } satisfies BuildOptions,
  });
