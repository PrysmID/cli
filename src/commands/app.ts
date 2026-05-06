/**
 * `prysmid app ...` — OIDC application management within a workspace.
 */
import { flagString } from "../args.js";
import { requireFlag, requirePositional } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const list: LeafCommand = {
  kind: "leaf",
  name: "list",
  summary: "List OIDC apps in a workspace.",
  help: `
Usage:
  prysmid app list --workspace <slug>
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps`,
    );
  },
};

const create: LeafCommand = {
  kind: "leaf",
  name: "create",
  summary: "Create a new OIDC application in a workspace.",
  help: `
Usage:
  prysmid app create \\
    --workspace <slug> \\
    --name "My App" \\
    --redirect-uri https://example.com/callback \\
    [--redirect-uri https://other.com/cb] \\
    [--app-type web|native|user-agent] \\
    [--auth-method basic|post|none|jwt]

--redirect-uri may be passed multiple times.
`,
  valueFlags: ["--workspace", "--name", "--app-type", "--auth-method"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const name = requireFlag(args, "--name");
    // --redirect-uri can repeat; gather from raw argv via positionals if needed.
    // Our parser overwrites repeats; for v0.1 we accept comma-separated:
    const rawRedirects = flagString(args, "--redirect-uri") ?? "";
    const redirect_uris = rawRedirects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (redirect_uris.length === 0) {
      throw new Error(
        "missing --redirect-uri (comma-separate multiple URIs in v0.1)",
      );
    }
    const body: Record<string, unknown> = {
      name,
      redirect_uris,
    };
    const appType = flagString(args, "--app-type");
    if (appType) body.app_type = appType;
    const authMethod = flagString(args, "--auth-method");
    if (authMethod) body.auth_method = authMethod;
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps`,
      { method: "POST", body },
    );
  },
};

const del: LeafCommand = {
  kind: "leaf",
  name: "delete",
  summary: "Delete an OIDC application.",
  help: `
Usage:
  prysmid app delete <app-id> --workspace <slug>
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "app id");
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

export const appCommands: Record<string, Command> = { list, create, delete: del };
