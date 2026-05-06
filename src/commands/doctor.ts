/**
 * `prysmid doctor` — diagnostic of auth, network, version. Used by agents
 * when something looks wrong; runs without --json defaults to a checklist.
 */
import { loadToken, getTokenPath } from "../core/tokenStore.js";
import { PrysmidApiError } from "../core/client.js";
import type { LeafCommand } from "./types.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export const doctor: LeafCommand = {
  kind: "leaf",
  name: "doctor",
  summary: "Run health checks: auth, API reachability, token expiry.",
  help: `
Usage:
  prysmid doctor [--profile <name>]

Verifies that:
  - a token is present (either env var PRYSMID_API_TOKEN or cached login)
  - the token is not expired
  - api.prysmid.com is reachable
  - the token is accepted by the API
`,
  noAuth: true,
  async run(_args, { cfg, log }) {
    const checks: Check[] = [];

    const cached = loadToken(cfg.apiBase, cfg.profile);
    const envTok = !!cfg.apiToken;
    checks.push({
      name: "credentials.present",
      ok: envTok || !!cached,
      detail: envTok
        ? "PRYSMID_API_TOKEN env var is set"
        : cached
        ? `cached token at ${getTokenPath(cfg.profile)}`
        : "no env var, no cached token — run `prysmid login`",
    });

    if (cached) {
      const remaining = cached.expiresAt - Math.floor(Date.now() / 1000);
      checks.push({
        name: "credentials.fresh",
        ok: remaining > 60,
        detail: remaining > 0 ? `expires in ${remaining}s` : "expired",
      });
    }

    let reachable = false;
    try {
      const res = await fetch(`${cfg.apiBase}/healthz`).catch(() => null);
      reachable = !!res && res.ok;
      checks.push({
        name: "api.reachable",
        ok: reachable,
        detail: reachable
          ? `${cfg.apiBase}/healthz responded OK`
          : `${cfg.apiBase} unreachable`,
      });
    } catch (e) {
      checks.push({
        name: "api.reachable",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    if (envTok || cached) {
      try {
        const { PrysmidClient } = await import("../core/client.js");
        const c = new PrysmidClient(cfg, log, cached?.accessToken ?? null);
        await c.request("/v1/users/me");
        checks.push({ name: "api.authorized", ok: true, detail: "token accepted" });
      } catch (e) {
        const detail =
          e instanceof PrysmidApiError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
        checks.push({ name: "api.authorized", ok: false, detail });
      }
    }

    const allOk = checks.every((c) => c.ok);
    if (!allOk) process.exitCode = 1;
    return { ok: allOk, profile: cfg.profile, api_base: cfg.apiBase, checks };
  },
};
