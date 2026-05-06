/**
 * `prysmid branding ...`
 */
import { flagString } from "../args.js";
import { requireFlag } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const get: LeafCommand = {
  kind: "leaf",
  name: "get",
  summary: "Get branding (label policy) for a workspace.",
  help: `Usage: prysmid branding get --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/branding`,
    );
  },
};

const update: LeafCommand = {
  kind: "leaf",
  name: "update",
  summary: "Update branding (colors, logo, label).",
  help: `
Usage:
  prysmid branding update --workspace <slug> \\
    [--primary-color "#000000"] [--background-color "#ffffff"] \\
    [--warn-color "#ff0000"]   [--font-color "#222222"]
`,
  valueFlags: [
    "--workspace",
    "--primary-color",
    "--background-color",
    "--warn-color",
    "--font-color",
  ],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const body: Record<string, string> = {};
    const map = {
      "--primary-color": "primary_color",
      "--background-color": "background_color",
      "--warn-color": "warn_color",
      "--font-color": "font_color",
    } as const;
    for (const [flag, field] of Object.entries(map)) {
      const v = flagString(args, flag);
      if (v) body[field] = v;
    }
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/branding`,
      { method: "PATCH", body },
    );
  },
};

const reset: LeafCommand = {
  kind: "leaf",
  name: "reset",
  summary: "Revert branding to platform defaults.",
  help: `Usage: prysmid branding reset --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/branding/reset`,
      { method: "POST" },
    );
  },
};

const deleteLogo: LeafCommand = {
  kind: "leaf",
  name: "delete-logo",
  summary: "Remove the workspace logo.",
  help: `Usage: prysmid branding delete-logo --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/branding/logo`,
      { method: "DELETE" },
    );
  },
};

export const brandingCommands: Record<string, Command> = {
  get,
  update,
  reset,
  "delete-logo": deleteLogo,
};
