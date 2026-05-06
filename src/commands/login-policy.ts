/**
 * `prysmid login-policy ...`
 */
import { flagString } from "../args.js";
import { requireFlag } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const get: LeafCommand = {
  kind: "leaf",
  name: "get",
  summary: "Get the workspace login policy.",
  help: `Usage: prysmid login-policy get --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/login-policy`,
    );
  },
};

const update: LeafCommand = {
  kind: "leaf",
  name: "update",
  summary: "Update login policy fields.",
  help: `
Usage:
  prysmid login-policy update --workspace <slug> [flags]

Flags (all optional):
  --allow-username-password   true|false
  --allow-register            true|false
  --allow-external-idp        true|false
  --force-mfa                 true|false
  --force-mfa-local-only      true|false
`,
  valueFlags: [
    "--workspace",
    "--allow-username-password",
    "--allow-register",
    "--allow-external-idp",
    "--force-mfa",
    "--force-mfa-local-only",
  ],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const body: Record<string, unknown> = {};
    const map: Record<string, string> = {
      "--allow-username-password": "allow_username_password",
      "--allow-register": "allow_register",
      "--allow-external-idp": "allow_external_idp",
      "--force-mfa": "force_mfa",
      "--force-mfa-local-only": "force_mfa_local_only",
    };
    for (const [flag, field] of Object.entries(map)) {
      const raw = flagString(args, flag);
      if (raw === undefined) {
        if (args.flags[flag] === true) body[field] = true;
        continue;
      }
      body[field] = raw === "true" || raw === "1";
    }
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/login-policy`,
      { method: "PATCH", body },
    );
  },
};

export const loginPolicyCommands: Record<string, Command> = { get, update };
