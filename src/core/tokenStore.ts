/**
 * On-disk cache for the device-flow access token.
 *
 * Path layout:
 *   - Windows: %APPDATA%\prysmid\<profile>.json
 *   - Linux/macOS: $XDG_CONFIG_HOME/prysmid/<profile>.json (default ~/.config/prysmid)
 *   - Fallback: ~/.prysmid/<profile>.json
 *
 * Cached entries are keyed by `apiBase`; switching staging↔prod is safe.
 * File mode is 0600 on Unix.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export interface CachedToken {
  apiBase: string;
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch seconds. */
  expiresAt: number;
}

const APP_DIR = "prysmid";
const EXPIRY_SKEW_SECONDS = 60;

export function getTokenPath(profile: string, env: NodeJS.ProcessEnv = process.env): string {
  const file = `${profile}.json`;
  if (platform() === "win32") {
    const base = env.APPDATA;
    if (base) return join(base, APP_DIR, file);
    return join(homedir(), `.${APP_DIR}`, file);
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, APP_DIR, file);
  return join(homedir(), ".config", APP_DIR, file);
}

export function loadToken(
  apiBase: string,
  profile: string,
  env: NodeJS.ProcessEnv = process.env,
): CachedToken | null {
  const path = getTokenPath(profile, env);
  if (!existsSync(path)) return null;
  let parsed: CachedToken;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as CachedToken;
  } catch {
    return null;
  }
  if (parsed.apiBase !== apiBase) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (parsed.expiresAt - EXPIRY_SKEW_SECONDS <= nowSec) return null;
  if (typeof parsed.accessToken !== "string" || !parsed.accessToken) return null;
  return parsed;
}

export function saveToken(
  token: CachedToken,
  profile: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = getTokenPath(profile, env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(token, null, 2), "utf8");
  if (platform() !== "win32") {
    try { chmodSync(path, 0o600); } catch { /* best-effort */ }
  }
}

export function clearToken(profile: string, env: NodeJS.ProcessEnv = process.env): void {
  const path = getTokenPath(profile, env);
  if (existsSync(path)) rmSync(path, { force: true });
}
