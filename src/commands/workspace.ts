/**
 * `prysmid workspace ...`
 */
import { flagBool, flagString, type ParsedArgs } from "../args.js";
import type { Command, Ctx, LeafCommand } from "./types.js";

const list: LeafCommand = {
  kind: "leaf",
  name: "list",
  summary: "List all workspaces accessible to the current token.",
  help: `
Usage:
  prysmid workspace list

Examples:
  prysmid workspace list
  prysmid workspace list -o json | jq '.[] | .slug'
`,
  async run(_args, { client }) {
    return await client.request("/v1/workspaces");
  },
};

const get: LeafCommand = {
  kind: "leaf",
  name: "get",
  summary: "Get a workspace by slug or id.",
  help: `
Usage:
  prysmid workspace get <slug-or-id>
`,
  async run(args, { client }) {
    const target = requirePositional(args, 0, "workspace slug or id");
    return await client.request(`/v1/workspaces/${encodeURIComponent(target)}`);
  },
};

const create: LeafCommand = {
  kind: "leaf",
  name: "create",
  summary: "Create a new workspace (returns immediately with state=provisioning).",
  help: `
Usage:
  prysmid workspace create --slug <slug> --display-name <name>

Slug must be lowercase alphanumeric + hyphens, 2-63 chars. It becomes
auth.<slug>.prysmid.com once provisioned. Use \`prysmid setup\` for an
end-to-end variant that waits until state=active.

Examples:
  prysmid workspace create --slug acme --display-name "Acme Inc"
`,
  valueFlags: ["--slug", "--display-name"],
  async run(args, { client }) {
    const slug = requireFlag(args, "--slug");
    const display_name = requireFlag(args, "--display-name");
    return await client.request("/v1/workspaces", {
      method: "POST",
      body: { slug, display_name },
    });
  },
};

const del: LeafCommand = {
  kind: "leaf",
  name: "delete",
  summary: "Delete a workspace and its Zitadel instance. Irreversible.",
  help: `
Usage:
  prysmid workspace delete <slug-or-id> --yes

Requires --yes to confirm. Tears down the Zitadel instance, custom domain,
and DB rows for the workspace. Cannot be undone.
`,
  valueFlags: [],
  async run(args, { client }) {
    const target = requirePositional(args, 0, "workspace slug or id");
    if (!flagBool(args, "--yes")) {
      throw new Error("refusing to delete without --yes");
    }
    return await client.request(`/v1/workspaces/${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
  },
};

export const workspaceCommands: Record<string, Command> = { list, get, create, delete: del };

// helpers shared across leaf commands of this group
export function requireFlag(args: ParsedArgs, name: string): string {
  const v = flagString(args, name);
  if (v === undefined || v === "") {
    throw new Error(`missing required flag ${name}`);
  }
  return v;
}

export function requirePositional(args: ParsedArgs, idx: number, label: string): string {
  const v = args.positional[idx];
  if (!v) throw new Error(`missing required argument: ${label}`);
  return v;
}
