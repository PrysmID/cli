/**
 * `prysmid idp ...` — identity providers per workspace.
 */
import { flagAll, flagString } from "../args.js";
import { readSecretFromFile, readSecretFromStdin } from "../core/prompt.js";
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

const show: LeafCommand = {
  kind: "leaf",
  name: "show",
  summary: "Show one IdP by id.",
  help: `
Usage:
  prysmid idp show <idp-id> --workspace <slug>

Fetches GET /v1/workspaces/{ws}/idps/{id} and pretty-prints the full
IdpDetail (type, state, client_id, issuer, scopes, secret_updated_at,
created_at). The client_secret is never returned by the API.
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "idp id");
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps/${encodeURIComponent(id)}`,
    );
  },
};

const update: LeafCommand = {
  kind: "leaf",
  name: "update",
  summary: "Update mutable fields on an IdP (including rotating its client_secret).",
  help: `
Usage:
  prysmid idp update <idp-id> --workspace <slug> \\
    [--name <name>] \\
    [--client-id <id>] \\
    [--client-secret-from-stdin | --client-secret-from-file <path>] \\
    [--scope <scope>] [--scope <scope> ...] \\
    [--issuer <url>] \\
    [--tenant-id <id>]

PATCH semantics — full replacement per field. Passing any --scope flag
REPLACES the existing scopes list (we do NOT append). Omit the flag to
leave it unchanged.

SECRET HANDLING
  There is NO --client-secret <value> flag. Passing a secret on the command
  line would persist it in shell history, process listings, and CI logs.
  Use one of:

    # from stdin
    printf '%s' "$SECRET" | prysmid idp update idp_123 --workspace acme \\
        --client-secret-from-stdin

    # from a file
    prysmid idp update idp_123 --workspace acme \\
        --client-secret-from-file ./secret.txt

  The secret is read whole, with a single trailing newline stripped.

Examples:
  prysmid idp update idp_123 --workspace acme --name "Acme Google"
  prysmid idp update idp_123 --workspace acme \\
    --scope openid --scope email --scope profile
`,
  valueFlags: [
    "--workspace",
    "--name",
    "--client-id",
    "--client-secret-from-file",
    "--scope",
    "--issuer",
    "--tenant-id",
  ],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "idp id");
    const ws = requireFlag(args, "--workspace");

    const body: Record<string, unknown> = {};

    const name = flagString(args, "--name");
    if (name !== undefined) body.name = name;

    const clientId = flagString(args, "--client-id");
    if (clientId !== undefined) body.client_id = clientId;

    const fromStdin = args.flags["--client-secret-from-stdin"] === true;
    const fromFile = flagString(args, "--client-secret-from-file");
    if (fromStdin && fromFile) {
      throw new Error(
        "use exactly one of --client-secret-from-stdin or --client-secret-from-file",
      );
    }
    if (fromStdin) {
      const secret = await readSecretFromStdin();
      if (secret === "") {
        throw new Error("stdin produced an empty client_secret");
      }
      body.client_secret = secret;
    } else if (fromFile) {
      const secret = readSecretFromFile(fromFile);
      if (secret === "") {
        throw new Error(`file '${fromFile}' produced an empty client_secret`);
      }
      body.client_secret = secret;
    }

    if (args.flags["--client-secret"] !== undefined) {
      throw new Error(
        "--client-secret is intentionally not supported (it would leak " +
          "into shell history). Use --client-secret-from-stdin or " +
          "--client-secret-from-file <path>.",
      );
    }

    const scopes = flagAll(args, "--scope");
    if (scopes) body.scopes = scopes.filter((s) => s !== "");

    const issuer = flagString(args, "--issuer");
    if (issuer !== undefined) body.issuer = issuer;

    const tenantId = flagString(args, "--tenant-id");
    if (tenantId !== undefined) body.tenant_id = tenantId;

    if (Object.keys(body).length === 0) {
      throw new Error(
        "no fields to update — pass at least one of --name, --client-id, " +
          "--client-secret-from-stdin, --client-secret-from-file, --scope, " +
          "--issuer, --tenant-id",
      );
    }

    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/idps/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    );
  },
};

export const idpCommands: Record<string, Command> = {
  list,
  add,
  show,
  update,
  delete: del,
  "enable-google": enableGoogle,
};
