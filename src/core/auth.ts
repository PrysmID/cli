/**
 * OAuth 2.0 Device Authorization Grant client (RFC 8628).
 *
 * Same protocol as `@prysmid/mcp` — both hit
 * /v1/auth/device/{start,poll} on api.prysmid.com which proxies to Zitadel.
 */
import type { Logger } from "./logger.js";

export interface DeviceFlowToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface DeviceStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | null;
  interval: number;
  expires_in: number;
}

interface DevicePollResponse {
  status: "pending" | "slow_down" | "complete" | "expired" | "denied";
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number | null;
  error?: string | null;
}

export interface DeviceFlowOptions {
  apiBase: string;
  log: Logger;
  sleep?: (ms: number) => Promise<void>;
  prompt?: (lines: string[]) => void;
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DEFAULT_PROMPT = (lines: string[]) => {
  for (const l of lines) process.stderr.write(`${l}\n`);
};

export async function deviceFlow(opts: DeviceFlowOptions): Promise<DeviceFlowToken> {
  const sleep = opts.sleep ?? DEFAULT_SLEEP;
  const prompt = opts.prompt ?? DEFAULT_PROMPT;
  const { apiBase, log } = opts;

  const start = await postJson<DeviceStartResponse>(
    `${apiBase}/v1/auth/device/start`,
    {},
  );

  const verifyUrl = start.verification_uri_complete || start.verification_uri;
  prompt([
    "",
    "─────────────────────────────────────────────────────────",
    " Prysmid CLI — Sign in to your account",
    "─────────────────────────────────────────────────────────",
    "",
    "  1. Open this URL in your browser:",
    `       ${verifyUrl}`,
    "",
    "  2. Confirm the code:",
    `       ${start.user_code}`,
    "",
    `  Waiting for confirmation (expires in ${start.expires_in}s)…`,
    "",
  ]);

  let interval = Math.max(1, start.interval || 5);
  const deadline = Date.now() + start.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    let res: DevicePollResponse;
    try {
      res = await postJson<DevicePollResponse>(
        `${apiBase}/v1/auth/device/poll`,
        { device_code: start.device_code },
      );
    } catch (e) {
      log.warn("device poll failed, retrying", {
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (res.status === "complete") {
      if (!res.access_token) throw new Error("device flow: no access_token");
      return {
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? undefined,
        expiresIn: res.expires_in ?? undefined,
      };
    }
    if (res.status === "slow_down") { interval += 5; continue; }
    if (res.status === "pending") continue;
    if (res.status === "expired") throw new Error("Device code expired before authorization");
    if (res.status === "denied") throw new Error("Authorization denied");
  }
  throw new Error("Device code expired before authorization");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${text}`);
  try { return JSON.parse(text) as T; } catch {
    throw new Error(`POST ${url} returned non-JSON: ${text.slice(0, 200)}`);
  }
}
