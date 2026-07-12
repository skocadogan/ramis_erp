import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { validateClientPublicEnv } from "./src/environments/validateClientPublicEnv";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");


validateClientPublicEnv();

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/** Medya dosyaları API kökünden sunulur; `NEXT_PUBLIC_API_URL` kökünü de ekler. */
function imageRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [
    { protocol: "http", hostname: "localhost", port: "8000", pathname: "/**" },
    { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/**" },
  ];
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return patterns;
  try {
    const u = new URL(api);
    const protocol = u.protocol === "https:" ? "https" : "http";

    // API port'lu pattern (development / doğrudan Django)
    const withPort: RemotePattern = {
      protocol,
      hostname: u.hostname,
      pathname: "/**",
      ...(u.port ? { port: u.port } : {}),
    };

    // Medya dosyaları production'da Nginx üzerinden 80/443'ten sunulur — port'suz pattern
    const withoutPort: RemotePattern = {
      protocol,
      hostname: u.hostname,
      pathname: "/**",
    };

    const key = (p: RemotePattern) =>
      `${p.protocol}://${p.hostname}${"port" in p && p.port ? `:${p.port}` : ""}`;

    if (!patterns.some((p) => key(p) === key(withPort))) {
      patterns.push(withPort);
    }
    if (!patterns.some((p) => key(p) === key(withoutPort))) {
      patterns.push(withoutPort);
    }
  } catch {
    /* env ayrıca doğrulanır */
  }
  return patterns;
}

/** Turbopack dev: LAN/tablet erişimi için izin verilen origin hostname'leri. */
function allowedDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);

  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    try {
      origins.add(new URL(api).hostname);
    } catch {
      /* env ayrıca doğrulanır */
    }
  }

  const extra = process.env.ALLOWED_DEV_ORIGINS;
  if (extra) {
    for (const part of extra.split(",")) {
      const host = part.trim();
      if (host) origins.add(host);
    }
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  output: "standalone", // Sunucuda minimum node_modules kullanımı sağlar.
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: allowedDevOrigins(),
  reactCompiler: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@base-ui/react",
    ],
  },
  turbopack: {
    root: __dirname,
    resolveExtensions: [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".mts",
      ".json",
      ".css",
      ".scss",
      ".sass",
      ".less",
      ".styl",
      ".stylus",
      ".pcss",
      ".postcss",
    ],
  },

  images: {
    remotePatterns: imageRemotePatterns(),
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    return [
      { source: "/runtime-config.json", destination: "/ramis/runtime-config" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      // /runtime-config.json için kısa bir cache: SW bu endpoint'i NetworkOnly olarak
      // kayıt ettiği için stale veri servis edilmez; tarayıcı cache'i ise 30 sn boyunca
      // RTT'yi tamamen ortadan kaldırır (her sayfa yenilemede roundtrip yok).
      {
        source: "/runtime-config.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=30, stale-while-revalidate=300" },
        ],
      },
    ];
  },
};

const wrap = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default wrap(withSerwist(withNextIntl(nextConfig)));
