/**
 * `prysmid idp ...` — identity providers per workspace.
 */
import { flagString } from "../args.js";
import { requireFlag, requirePositional } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const list: LeafCommand = {
  kind: "leaf",
  name: "list",
  summary: "List IdPs configured on a workspace.",
  help: `
Usage:
  prysmid idp list --workspace <slug>
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps`,
    );
  },
};

const add: LeafCommand = {
  kind: "leaf",
  name: "add",
  summary: "Add an IdP (google, github, oidc, saml, ...).",
  help: `
Usage:
  prysmid idp add \\
    --workspace <slug> \\
    --type <google|github|oidc|saml|...> \\
    --name <display name> \\
    --client-id <id> \\
    --client-secret <secret> \\
    [--issuer <url>]   (oidc)
    [--scopes openid,email,profile]
`,
  valueFlags: [
    "--workspace",
    "--type",
    "--name",
    "--client-id",
    "--client-secret",
    "--issuer",
    "--scopes",
  ],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const body: Record<string, unknown> = {
      type: requireFlag(args, "--type"),
      name: requireFlag(args, "--name"),
      client_id: requireFlag(args, "--client-id"),
      client_secret: requireFlag(args, "--client-secret"),
    };
    const issuer = flagString(args, "--issuer");
    if (issuer) body.issuer = issuer;
    const scopes = flagString(args, "--scopes");
    if (scopes) body.scopes = scopes.split(",").map((s) => s.trim()).filter(Boolean);
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps`,
      { method: "POST", body },
    );
  },
};

const del: LeafCommand = {
  kind: "leaf",
  name: "delete",
  summary: "Delete an IdP.",
  help: `
Usage:
  prysmid idp delete <idp-id> --workspace <slug>
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "idp id");
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

const enableGoogle: LeafCommand = {
  kind: "leaf",
  name: "enable-google",
  summary: "Add Google IdP and enable external IdPs in the login policy.",
  help: `
Usage:
  prysmid idp enable-google \\
    --workspace <slug> \\
    --client-id <google-client-id> \\
    --client-secret <google-client-secret> \\
    [--name "Google"]

Equivalent to the MCP tool \`enable_google_login\`.
`,
  valueFlags: ["--workspace", "--client-id", "--client-secret", "--name"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const idp = await client.request<{ id: string }>(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps`,
      {
        method: "POST",
        body: {
          type: "google",
          name: flagString(args, "--name") ?? "Google",
          client_id: requireFlag(args, "--client-id"),
          client_secret: requireFlag(args, "--client-secret"),
        },
      },
    );
    await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/login-policy`,
      { method: "PATCH", body: { allow_external_idp: true } },
    );
    return { ok: true, idp };
  },
};

export const idpCommands: Record<string, Command> = {
  list,
  add,
  delete: del,
  "enable-google": enableGoogle,
};
