import { clientPublicEnvSchema } from "./clientPublicSchema";

/** next.config yüklenirken çağrılır; hata varsa build / next dev başlamaz. */
export function validateClientPublicEnv(): void {
  const result = clientPublicEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });
  if (!result.success) {
    const detail = JSON.stringify(result.error.flatten(), null, 2);
    throw new Error(`[env] NEXT_PUBLIC_* doğrulanamadı.\n${detail}`);
  }
}
