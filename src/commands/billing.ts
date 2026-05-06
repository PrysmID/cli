/**
 * `prysmid billing ...`
 */
import { flagString } from "../args.js";
import { requireFlag } from "./workspace.js";
import type { Command, LeafCommand } from "./types.js";

const state: LeafCommand = {
  kind: "leaf",
  name: "state",
  summary: "Show billing state for a workspace.",
  help: `Usage: prysmid billing state --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/billing`,
    );
  },
};

const checkout: LeafCommand = {
  kind: "leaf",
  name: "checkout",
  summary: "Start a Stripe checkout session for plan upgrade.",
  help: `
Usage:
  prysmid billing checkout --workspace <slug> --plan pro
`,
  valueFlags: ["--workspace", "--plan"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/billing/checkout`,
      { method: "POST", body: { plan: requireFlag(args, "--plan") } },
    );
  },
};

const portal: LeafCommand = {
  kind: "leaf",
  name: "portal",
  summary: "Open a Stripe billing portal session.",
  help: `Usage: prysmid billing portal --workspace <slug>`,
  valueFlags: ["--workspace"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/billing/portal`,
      { method: "POST" },
    );
  },
};

const cap: LeafCommand = {
  kind: "leaf",
  name: "cap",
  summary: "Set spending cap (USD/month).",
  help: `Usage: prysmid billing cap --workspace <slug> --amount 100`,
  valueFlags: ["--workspace", "--amount"],
  async run(args, { client }) {
    const ws = requireFlag(args, "--workspace");
    const amount = Number(flagString(args, "--amount"));
    if (!Number.isFinite(amount)) throw new Error("--amount must be a number");
    return await client.request(
      `/v1/workspaces/${encodeURIComponent(ws)}/billing/cap`,
      { method: "PUT", body: { amount } },
    );
  },
};

export const billingCommands: Record<string, Command> = { state, checkout, portal, cap };
