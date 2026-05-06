/**
 * `prysmid user ...` — workspace user management.
 */
import { flagBool } from "../args.js";
import { requireFlag, requirePositional } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const list: LeafCommand = {
  kind: "leaf",
  name: "list",
  summary: "List users in a workspace.",
  help: `
Usage:
  prysmid user list --workspace <slug>
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/users`,
    );
  },
};

const invite: LeafCommand = {
  kind: "leaf",
  name: "invite",
  summary: "Invite a user by email.",
  help: `
Usage:
  prysmid user invite --workspace <slug> --email <email> [--role admin|member]
`,
  valueFlags: ["--workspace", "--email", "--role"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const body: Record<string, unknown> = { email: requireFlag(args, "--email") };
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/users/invite`,
      { method: "POST", body },
    );
  },
};

const del: LeafCommand = {
  kind: "leaf",
  name: "delete",
  summary: "Delete a user from a workspace.",
  help: `
Usage:
  prysmid user delete <user-id> --workspace <slug> --yes
`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const id = requirePositional(args, 0, "user id");
    const ws = requireFlag(args, "--workspace");
    if (!flagBool(args, "--yes")) {
      throw new Error("refusing to delete without --yes");
    }
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/users/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

export const userCommands: Record<string, Command> = { list, invite, delete: del };
