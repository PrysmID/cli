/**
 * `prysmid app ...` — OIDC application management within a workspace.
 */
import { flagAll, flagBool, flagString } from "../args.js";
import { confirm } from "../core/prompt.js";
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

--redirect-uri may be passed multiple times. A comma-separated single value
is also accepted for backwards compatibility.
`,
  valueFlags: ["--workspace", "--name", "--redirect-uri", "--app-type", "--auth-method"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const name = requireFlag(args, "--name");
    // Prefer the repeatable form. Fall back to legacy comma-separated.
    const repeated = flagAll(args, "--redirect-uri") ?? [];
    const redirect_uris = repeated.length > 1
      ? repeated
      : (repeated[0] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (redirect_uris.length === 0) {
      throw new Error(
        "missing --redirect-uri (may be passed multiple times)",
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

const show: LeafCommand = {
  kind: "leaf",
  name: "show",
  summary: "Show one OIDC application by id.",
  help: `
Usage:
  prysmid app show <app-id> --workspace <slug>

Fetches GET /v1/workspaces/{ws}/apps/{id} and pretty-prints the full
AppDetail (redirect_uris, grant_types, auth_method, dev_mode, rotated_at,
created_at). Use --json for raw JSON output.
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "app id");
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps/${encodeURIComponent(id)}`,
    );
  },
};

const update: LeafCommand = {
  kind: "leaf",
  name: "update",
  summary: "Update mutable fields on an OIDC application.",
  help: `
Usage:
  prysmid app update <app-id> --workspace <slug> \\
    [--redirect-uri <url>] [--redirect-uri <url> ...] \\
    [--post-logout-redirect-uri <url> ...] \\
    [--grant-type <type> ...] \\
    [--auth-method basic|post|none|jwt] \\
    [--dev-mode true|false]

PATCH semantics — full replacement per field. If you pass any
--redirect-uri the new list of URIs REPLACES the existing list (we do NOT
append). To clear a list, pass --redirect-uri="" once. To leave a list
unchanged, omit the flag entirely. Same applies to
--post-logout-redirect-uri and --grant-type.

Examples:
  prysmid app update app_123 --workspace acme \\
    --redirect-uri https://a.example.com/cb \\
    --redirect-uri https://b.example.com/cb

  prysmid app update app_123 --workspace acme --dev-mode false
`,
  valueFlags: [
    "--workspace",
    "--redirect-uri",
    "--post-logout-redirect-uri",
    "--grant-type",
    "--auth-method",
    "--dev-mode",
  ],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "app id");
    const ws = requireFlag(args, "--workspace");

    const body: Record<string, unknown> = {};

    const redirects = flagAll(args, "--redirect-uri");
    if (redirects) {
      body.redirect_uris = redirects.filter((s) => s !== "");
    }
    const postLogout = flagAll(args, "--post-logout-redirect-uri");
    if (postLogout) {
      body.post_logout_redirect_uris = postLogout.filter((s) => s !== "");
    }
    const grants = flagAll(args, "--grant-type");
    if (grants) {
      body.grant_types = grants.filter((s) => s !== "");
    }
    const authMethod = flagString(args, "--auth-method");
    if (authMethod) body.auth_method = authMethod;
    const devMode = flagString(args, "--dev-mode");
    if (devMode !== undefined) {
      if (devMode !== "true" && devMode !== "false") {
        throw new Error("--dev-mode must be 'true' or 'false'");
      }
      body.dev_mode = devMode === "true";
    }

    if (Object.keys(body).length === 0) {
      throw new Error(
        "no fields to update — pass at least one of --redirect-uri, " +
          "--post-logout-redirect-uri, --grant-type, --auth-method, --dev-mode",
      );
    }

    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    );
  },
};

const regenerateSecret: LeafCommand = {
  kind: "leaf",
  name: "regenerate-secret",
  summary: "Rotate the client_secret of an OIDC application. Destructive.",
  help: `
Usage:
  prysmid app regenerate-secret <app-id> --workspace <slug> [--yes]

Rotates the client_secret for the application. The OLD secret is invalidated
immediately — every running deployment using it will start failing OIDC
exchanges until you redeploy with the new secret.

By default the command prompts on stderr for confirmation. Pass --yes to
skip the prompt (CI / scripts). Stdin must be a TTY for the prompt; in
non-TTY contexts --yes is required.

OUTPUT
  The new client_secret is written to stdout as a single bare line, with no
  decoration, so it can be piped directly into a password manager:

    prysmid app regenerate-secret app_123 --workspace acme --yes \\
      | gh secret set OIDC_CLIENT_SECRET --body -

  A human-readable warning is written to stderr. This is the ONLY time the
  secret is shown.
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "app id");
    const ws = requireFlag(args, "--workspace");
    const yes = flagBool(args, "--yes");

    if (!yes) {
      process.stderr.write(
        `About to rotate the client_secret for app '${id}' in workspace '${ws}'.\n` +
          "The current secret will be INVALIDATED immediately and shown ONCE.\n" +
          "Type 'yes' to confirm: ",
      );
      // confirm() writes its own prompt; we already wrote ours, so call it
      // with an empty extra prompt to keep the API symmetric.
      const ok = await confirm("");
      if (!ok) {
        process.stderr.write("aborted.\n");
        process.exit(1);
      }
    }

    const result = await client.request<{ client_secret: string } & Record<string, unknown>>(
      `/v1/workspaces/${encodeURIComponent(ws)}/apps/${encodeURIComponent(id)}/regenerate-secret`,
      { method: "POST" },
    );

    const secret = result?.client_secret;
    if (typeof secret !== "string" || secret === "") {
      throw new Error(
        "rotate succeeded but response did not include client_secret",
      );
    }
    // Bare secret on stdout — pipelines depend on this exact shape.
    process.stdout.write(secret + "\n");
    process.stderr.write(
      "This is the only time the secret will be shown. Save it now.\n",
    );
    // We've handled output ourselves; return undefined so emit() prints nothing.
    return undefined;
  },
};

export const appCommands: Record<string, Command> = {
  list,
  create,
  show,
  update,
  delete: del,
  "regenerate-secret": regenerateSecret,
};
