/**
 * `prysmid login | logout | whoami` — device-flow auth + local cache.
 */
import { deviceFlow } from "../core/auth.js";
import { clearToken, loadToken, saveToken } from "../core/tokenStore.js";
import type { Command, Ctx, LeafCommand } from "./types.js";

const login: LeafCommand = {
  kind: "leaf",
  name: "login",
  summary: "Sign in via browser device flow and cache the token locally.",
  help: `
Usage:
  prysmid login [--profile <name>]

Opens a verification URL in your browser and waits for confirmation. The
resulting token is cached under your config dir and reused by every other
command.

Examples:
  prysmid login
  prysmid login --profile staging
`,
  noAuth: true,
  async run(_args, { cfg, log }) {
    const tok = await deviceFlow({ apiBase: cfg.apiBase, log });
    const expiresIn = tok.expiresIn ?? 3600;
    saveToken(
      {
        apiBase: cfg.apiBase,
        accessToken: tok.accessToken,
        refreshToken: tok.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      },
      cfg.profile,
    );
    return { ok: true, profile: cfg.profile, apiBase: cfg.apiBase };
  },
};

const logout: LeafCommand = {
  kind: "leaf",
  name: "logout",
  summary: "Remove the cached token for the current profile.",
  help: `
Usage:
  prysmid logout [--profile <name>]
`,
  noAuth: true,
  async run(_args, { cfg }) {
    clearToken(cfg.profile);
    return { ok: true, profile: cfg.profile };
  },
};

const whoami: LeafCommand = {
  kind: "leaf",
  name: "whoami",
  summary: "Show the authenticated user and active profile.",
  help: `
Usage:
  prysmid whoami

Calls /v1/auth/me on the active profile and prints the result. Exits
non-zero if not authenticated.
`,
  async run(_args, { client, cfg }: Ctx) {
    const me = await client.request<unknown>("/v1/auth/me").catch((e) => {
      throw e;
    });
    const cached = loadToken(cfg.apiBase, cfg.profile);
    return {
      profile: cfg.profile,
      api_base: cfg.apiBase,
      token_expires_at: cached?.expiresAt ?? null,
      user: me,
    };
  },
};

export const authCommands: Record<string, Command> = { login, logout, whoami };
