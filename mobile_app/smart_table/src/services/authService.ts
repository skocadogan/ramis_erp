// ============================================================
// Smart Table — Auth Service
// Login, profile fetch, connection test API calls
// ============================================================

import type { AuthUser } from "@/store/auth-store";

interface MeResponse {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  branch_id?: string;
  branch_name?: string;
}

/**
 * Test if a server URL is reachable by calling the health endpoint.
 */
export async function testConnection(
  serverUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/v1/health/`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (response.ok) return { ok: true };
    return {
      ok: false,
      error: `Sunucu yanıt verdi ancak hata döndü (${response.status})`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sunucuya bağlanılamadı",
    };
  }
}

/**
 * Login with username + password against a specific server.
 * Returns JWT token pair on success.
 */
export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; refresh: string; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/v1/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const json = await response.json();

    if (!response.ok) {
      const errorMsg =
        json?.detail || json?.message || "Kullanıcı adı veya şifre hatalı";
      return { token: "", refresh: "", error: errorMsg };
    }

    return { token: json.access, refresh: json.refresh };
  } catch (err: unknown) {
    return {
      token: "",
      refresh: "",
      error: err instanceof Error ? err.message : "Sunucuya bağlanılamadı",
    };
  }
}

/**
 * Fetch the authenticated user's profile from /auth/me/.
 * Must have a valid token on the server.
 */
export async function getProfile(
  serverUrl: string,
  token: string,
): Promise<{ user: AuthUser | null; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/v1/auth/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const json = await response.json();

    if (!response.ok) {
      return { user: null, error: json?.detail || "Profil bilgisi alınamadı" };
    }

    const data = json as MeResponse;
    const user: AuthUser = {
      id: data.id,
      username: data.username,
      email: data.email || "",
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      branch_id: data.branch_id,
      branch_name: data.branch_name,
    };

    return { user };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : "Sunucuya bağlanılamadı",
    };
  }
}
