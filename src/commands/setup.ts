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

export const setupCheck: LeafCommand = {
  kind: "leaf",
  name: "setup-check",
  summary: "Run platform setup diagnostics on a workspace.",
  help: `
Usage:
  prysmid setup-check --workspace <slug>

Returns a checklist: Zitadel reachable, SMTP configured, login policy sane,
custom domain DNS, etc.
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/setup-check`,
    );
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
