/**
 * `prysmid setup` and `prysmid setup-check` — high-level orchestrators.
 * Equivalent to MCP curated tools setup_prysmid_workspace + prysmid_setup_check.
 */
import { flagString } from "../args.js";
import { requireFlag } from "./workspace.js";
import type { LeafCommand } from "./types.js";

export const setup: LeafCommand = {
  kind: "leaf",
  name: "setup",
  summary: "Create a workspace and wait until it's fully provisioned.",
  help: `
Usage:
  prysmid setup --slug <slug> --display-name <name> [--timeout 120]

Creates the workspace and polls until state=active (or fails). Returns the
auth_domain ready to integrate. Equivalent to MCP \`setup_prysmid_workspace\`.

Examples:
  prysmid setup --slug acme --display-name "Acme Inc"
  prysmid setup --slug acme --display-name "Acme" --timeout 240
`,
  valueFlags: ["--slug", "--display-name", "--timeout"],
  async run(args, { client, log }) {
    const slug = requireFlag(args, "--slug");
    const display_name = requireFlag(args, "--display-name");
    const timeout = Number(flagString(args, "--timeout") ?? "120");

    const created = await client.request<{ id: string; slug: string; state: string; auth_domain?: string }>(
      "/v1/workspaces",
      { method: "POST", body: { slug, display_name } },
    );

    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const ws = await client.request<{
        id: string; slug: string; state: string; auth_domain?: string; provisioning_error?: string;
      }>(`/v1/workspaces/${encodeURIComponent(created.id)}`);
      if (ws.state === "active") {
        return {
          workspace_id: ws.id,
          slug: ws.slug,
          auth_domain: ws.auth_domain ?? `auth.${ws.slug}.prysmid.com`,
          state: ws.state,
        };
      }
      if (ws.state === "provisioning_failed") {
        throw new Error(`provisioning failed: ${ws.provisioning_error ?? "unknown"}`);
      }
      log.debug(`workspace ${created.id} state=${ws.state}, polling…`);
      await sleep(3000);
    }
    throw new Error(`workspace did not reach state=active within ${timeout}s`);
  },
};

type ListResp = { items?: unknown[]; total?: number } | unknown[];

function countItems(resp: ListResp): number {
  if (Array.isArray(resp)) return resp.length;
  if (typeof (resp as { total?: number }).total === "number") return (resp as { total: number }).total;
  if (Array.isArray((resp as { items?: unknown[] }).items)) return (resp as { items: unknown[] }).items.length;
  return 0;
}

interface SetupCheckItem {
  ok: boolean;
  name: string;
  details?: string;
}

export const setupCheck: LeafCommand = {
  kind: "leaf",
  name: "setup-check",
  summary: "Run a readiness checklist on a workspace.",
  help: `
Usage:
  prysmid setup-check --workspace <slug>

Returns pass/fail for: workspace state=active, ≥1 OIDC app, ≥1 IdP OR
password+register enabled, branding primary_color set, login_policy MFA or
external IdP. Mirrors the MCP curated tool prysmid_setup_check — composes
reads against /workspaces, /apps, /idps, /login-policy, /branding.
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const enc = encodeURIComponent(ws);

    const workspace = await client.request<{ state: string; auth_domain?: string }>(
      `/v1/workspaces/${enc}`,
    );
    const appsResp = await client.request<ListResp>(`/v1/workspaces/${enc}/apps`);
    const idpsResp = await client.request<ListResp>(`/v1/workspaces/${enc}/idps`);
    const policy = await client.request<{
      allow_username_password?: boolean;
      allow_register?: boolean;
      allow_external_idp?: boolean;
      force_mfa?: boolean;
    }>(`/v1/workspaces/${enc}/login-policy`);
    const branding = await client.request<{ primary_color?: string }>(
      `/v1/workspaces/${enc}/branding`,
    );

    const appsCount = countItems(appsResp);
    const idpsCount = countItems(idpsResp);
    const passwordsOpen =
      policy.allow_username_password === true && policy.allow_register === true;

    const checks: SetupCheckItem[] = [
      {
        ok: workspace.state === "active",
        name: "workspace_active",
        details: `state=${workspace.state}`,
      },
      {
        ok: appsCount > 0,
        name: "has_at_least_one_app",
        details: `${appsCount} apps`,
      },
      {
        ok: idpsCount > 0 || passwordsOpen,
        name: "users_can_sign_in",
        details:
          idpsCount > 0
            ? `${idpsCount} idps`
            : passwordsOpen
              ? "no idps but username+password (with self-registration) allowed"
              : "no idps; enable allow_username_password+allow_register or add an IdP",
      },
      {
        ok: !!branding.primary_color,
        name: "branding_primary_color_set",
      },
      {
        ok: policy.force_mfa === true || idpsCount > 0,
        name: "auth_strength_reasonable",
        details: policy.force_mfa
          ? "force_mfa=true"
          : idpsCount > 0
            ? `${idpsCount} external IdP(s) — strength delegated upstream`
            : "MFA off and no external IdPs — passwords-only is weak",
      },
    ];
    const verdict = checks.every((c) => c.ok) ? "ready" : "incomplete";
    return { verdict, checks };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
