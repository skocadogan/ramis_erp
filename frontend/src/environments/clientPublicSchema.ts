import { z } from "zod";

/**
 * Build / dev sunucusu başlarken doğrulanır (next.config.ts).
 * Yeni NEXT_PUBLIC_* anahtarları için burayı genişletin.
 */
const nextPublicApiUrl = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  },
  z
    .string()
    .url({ message: "NEXT_PUBLIC_API_URL geçerli bir http(s) adresi olmalıdır." })
    .refine(
      (url) => {
        const p = new URL(url).pathname.replace(/\/$/, "") || "/";
        return p === "/api/v1" || p.endsWith("/api/v1");
      },
      {
        message:
          "NEXT_PUBLIC_API_URL yolu /api/v1 ile bitmelidir (örn. http://localhost:8000/api/v1).",
      }
    )
    .optional()
);

export const clientPublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: nextPublicApiUrl,
  NEXT_PUBLIC_POS_OFFLINE_QUEUE: z
    .enum(["true", "false"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
