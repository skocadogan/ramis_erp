import { ESP_SETUP_URL, type ButtonSetupPayload } from "./types";

export interface EspSetupResponse {
  status: string;
  message?: string;
}

export class ButtonSetupApiError extends Error {
  constructor(
    message: string,
    public readonly code: "timeout" | "network" | "rejected" | "unknown"
  ) {
    super(message);
    this.name = "ButtonSetupApiError";
  }
}

export async function postButtonSetup(
  payload: ButtonSetupPayload,
  timeoutMs = 15000
): Promise<EspSetupResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ESP_SETUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: EspSetupResponse | null = null;
    try {
      data = (await response.json()) as EspSetupResponse;
    } catch {
      /* gövde JSON değilse */
    }

    if (!response.ok) {
      throw new ButtonSetupApiError(data?.message || `HTTP ${response.status}`, "rejected");
    }

    if (data?.status !== "success") {
      throw new ButtonSetupApiError(data?.message || "unexpected_response", "rejected");
    }

    return data;
  } catch (err) {
    if (err instanceof ButtonSetupApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new ButtonSetupApiError("timeout", "timeout");
    }
    throw new ButtonSetupApiError(err instanceof Error ? err.message : "network_error", "network");
  } finally {
    clearTimeout(timer);
  }
}
