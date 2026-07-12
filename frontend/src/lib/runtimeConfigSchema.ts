import { z } from "zod";

const apiBaseUrl = z
  .string()
  .url({ message: "apiBaseUrl geçerli bir http(s) adresi olmalıdır." })
  .refine(
    (url) => {
      const p = new URL(url).pathname.replace(/\/$/, "") || "/";
      return p === "/api/v1" || p.endsWith("/api/v1");
    },
    { message: "apiBaseUrl yolu /api/v1 ile bitmelidir." }
  );

export const runtimeConfigPayloadSchema = z.object({
  apiBaseUrl,
  /** EPIC-07 — POS çevrimdışı işlem kuyruğu */
  posOfflineQueue: z.boolean().optional(),
  /** Axios interceptor otomatik toast (production'da varsayılan kapalı) */
  apiInterceptorToasts: z.boolean().optional(),
});

export type RuntimeConfigPayload = z.infer<typeof runtimeConfigPayloadSchema>;

export type RuntimePublicFlags = {
  posOfflineQueue: boolean;
  apiInterceptorToasts: boolean;
};
