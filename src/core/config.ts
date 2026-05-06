/**
 * Runtime config for the Prysmid CLI.
 *
 * Sources, in order of precedence:
 *   1. CLI flag (`--api-base`, `--profile`) — handled by the parser, not here.
 *   2. Env vars: PRYSMID_API_BASE, PRYSMID_API_TOKEN, PRYSMID_PROFILE.
 *   3. Defaults below.
 *
 * Token resolution is separate (see tokenStore.ts) — this only carries the
 * static-token override path used by CI and the `PRYSMID_API_TOKEN=…` mode.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  apiBase: string;
  apiToken: string | null;
  profile: string;
  logLevel: LogLevel;
}

const DEFAULT_API_BASE = "https://api.prysmid.com";
const DEFAULT_PROFILE = "prysmid";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiBase = (env.PRYSMID_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const apiToken = env.PRYSMID_API_TOKEN?.trim() || null;
  const profile = env.PRYSMID_PROFILE?.trim() || DEFAULT_PROFILE;
  const rawLevel = (env.PRYSMID_LOG_LEVEL ?? "warn").toLowerCase();
  const logLevel: LogLevel =
    rawLevel === "debug" || rawLevel === "info" || rawLevel === "error"
      ? (rawLevel as LogLevel)
      : "warn";
  return { apiBase, apiToken, profile, logLevel };
}
