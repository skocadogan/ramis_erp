import "server-only";

import fs from "node:fs";
import {
  runtimeConfigPayloadSchema,
  type RuntimeConfigPayload,
} from "@/lib/runtimeConfigSchema";

const DEFAULT_RUNTIME_CONFIG_PATH = "/etc/ramis/runtime-config.json";

function getRuntimeConfigFilePath(): string {
  return process.env.RAMIS_RUNTIME_CONFIG_PATH?.trim() || DEFAULT_RUNTIME_CONFIG_PATH;
}

export function readRuntimeConfigFileSync(): RuntimeConfigPayload | null {
  const configPath = getRuntimeConfigFilePath();
  try {
    // Harici JSON; build sırasında NFT tüm projeyi izlemesin (Turbopack).
    const raw = fs.readFileSync(/* turbopackIgnore: true */ configPath, "utf8");
    const parsed = runtimeConfigPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
