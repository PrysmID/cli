/**
 * `prysmid` — entrypoint and dispatcher.
 *
 * Layout of the command tree:
 *   prysmid login | logout | whoami | doctor | describe-tools | setup | setup-check
 *   prysmid workspace { list, get, create, delete }
 *   prysmid app       { list, create, delete }
 *   prysmid idp       { list, add, delete, enable-google }
 *   prysmid user      { list, invite, delete }
 *   prysmid branding  { get, update, reset, delete-logo }
 *   prysmid billing   { state, checkout, portal, cap }
 *   prysmid login-policy { get, update }
 *
 * Auth precedence: PRYSMID_API_TOKEN > cached device-flow token > none.
 *
 * Output: stdout for data (JSON when piped, pretty when TTY); stderr for logs.
 *
 * Exit codes:
 *   0  ok
 *   1  command failure (API error, validation, missing flag)
 *   2  unknown command / bad usage
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { parseArgs, flagBool, flagString } from "./args.js";
import { loadConfig, type LogLevel } from "./core/config.js";
import { makeLogger } from "./core/logger.js";
import { PrysmidApiError, PrysmidClient } from "./core/client.js";
import { loadToken } from "./core/tokenStore.js";

import { authCommands } from "./commands/auth.js";
import { doctor } from "./commands/doctor.js";
import { workspaceCommands } from "./commands/workspace.js";
import { appCommands } from "./commands/app.js";
import { idpCommands } from "./commands/idp.js";
import { userCommands } from "./commands/user.js";
import { brandingCommands } from "./commands/branding.js";
import { billingCommands } from "./commands/billing.js";
import { loginPolicyCommands } from "./commands/login-policy.js";
import { setup, setupCheck } from "./commands/setup.js";
import { buildManifest } from "./commands/describe-tools.js";

import { emit, pickFormat } from "./output.js";
import { renderGroupHelp, renderRootHelp } from "./help.js";
import type { Command, GroupCommand, LeafCommand } from "./commands/types.js";

const VERSION = readVersion();

const ROOT: Record<string, Command> = {
  // top-level leaves
  login: authCommands.login!,
  logout: authCommands.logout!,
  whoami: authCommands.whoami!,
  doctor,
  setup,
  "setup-check": setupCheck,
  "describe-tools": describeToolsCmd(),

  // groups
  workspace: group("workspace", "Manage Prysmid workspaces.", workspaceCommands),
  app: group("app", "Manage OIDC applications.", appCommands),
  idp: group("idp", "Manage identity providers.", idpCommands),
  user: group("user", "Manage workspace users.", userCommands),
  branding: group("branding", "Manage workspace branding.", brandingCommands),
  billing: group("billing", "Manage billing and plans.", billingCommands),
  "login-policy": group("login-policy", "Manage workspace login policy.", loginPolicyCommands),
};

const GLOBAL_VALUE_FLAGS = ["-o", "--output", "--profile", "--api-base"] as const;
const GLOBAL_ALIASES = { "-o": "--output", "-h": "--help", "-q": "--quiet", "-v": "--verbose" } as const;

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`prysmid: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(renderRootHelp(ROOT, VERSION) + "\n");
    return;
  }
  if (argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    return;
  }

  const head = argv[0]!;
  const node = ROOT[head];
  if (!node) {
    process.stderr.write(`prysmid: unknown command '${head}'. Run 'prysmid --help'.\n`);
    process.exit(2);
  }

  // Walk groups until we hit a leaf or a help flag.
  let cmd: Command = node;
  let consumed = 1;
  let path = [head];
  while (cmd.kind === "group") {
    const next = argv[consumed];
    if (!next || next === "--help" || next === "-h") {
      process.stdout.write(renderGroupHelp(path.join(" "), cmd) + "\n");
      return;
    }
    const sub = (cmd as GroupCommand).subcommands[next];
    if (!sub) {
      process.stderr.write(
        `prysmid: unknown subcommand '${next}' under '${path.join(" ")}'. ` +
          `Run 'prysmid ${path.join(" ")} --help'.\n`,
      );
      process.exit(2);
    }
    cmd = sub;
    path.push(next);
    consumed++;
  }

  const leaf = cmd as LeafCommand;
  const valueFlags = [
    ...GLOBAL_VALUE_FLAGS,
    ...(leaf.valueFlags ?? []),
  ];
  const args = parseArgs(argv.slice(consumed), {
    valueFlags,
    aliases: GLOBAL_ALIASES,
  });

  if (flagBool(args, "--help")) {
    process.stdout.write(`prysmid ${path.join(" ")} — ${leaf.summary}\n${leaf.help}\n`);
    return;
  }

  // Resolve effective config (env + CLI flag overrides).
  const env = { ...process.env };
  const overrideBase = flagString(args, "--api-base");
  if (overrideBase) env.PRYSMID_API_BASE = overrideBase;
  const overrideProfile = flagString(args, "--profile");
  if (overrideProfile) env.PRYSMID_PROFILE = overrideProfile;
  const cfg = loadConfig(env);

  // Verbosity flags override env.
  let level: LogLevel = cfg.logLevel;
  if (flagBool(args, "--verbose")) level = "debug";
  if (flagBool(args, "--quiet")) level = "error";
  const log = makeLogger(level);

  // Resolve token: env > cached.
  let tokenOverride: string | null = null;
  if (!cfg.apiToken) {
    const cached = loadToken(cfg.apiBase, cfg.profile, env);
    tokenOverride = cached?.accessToken ?? null;
  }

  if (!leaf.noAuth && !cfg.apiToken && !tokenOverride) {
    process.stderr.write(
      "prysmid: not authenticated. Run `prysmid login` or set PRYSMID_API_TOKEN.\n",
    );
    process.exit(1);
  }

  const client = new PrysmidClient(cfg, log, tokenOverride);
  const fmt = pickFormat(flagString(args, "--output") ?? (flagBool(args, "--json") ? "json" : undefined));

  try {
    const result = await leaf.run(args, { client, log, cfg });
    emit(result, fmt);
  } catch (err) {
    if (err instanceof PrysmidApiError) {
      const hint = remediation(err);
      process.stderr.write(`prysmid: API error ${err.status} — ${err.message}\n`);
      if (err.body) process.stderr.write(err.body + "\n");
      if (hint) process.stderr.write(`hint: ${hint}\n`);
      process.exit(1);
    }
    process.stderr.write(
      `prysmid: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

function group(
  name: string,
  summary: string,
  subcommands: Record<string, Command>,
): GroupCommand {
  return { kind: "group", name, summary, subcommands };
}

function describeToolsCmd(): LeafCommand {
  return {
    kind: "leaf",
    name: "describe-tools",
    summary: "Emit a JSON manifest of every command (for agents).",
    help: `
Usage:
  prysmid describe-tools

Outputs JSON with every leaf command, its summary, full help text, and value
flags. Designed for LLM/agent ingestion in one call. Equivalent in spirit to
the MCP \`tools/list\`.
`,
    noAuth: true,
    async run() {
      return buildManifest(ROOT, VERSION);
    },
  };
}

function remediation(err: PrysmidApiError): string | null {
  if (err.status === 401) return "run `prysmid login` to refresh credentials";
  if (err.status === 403) return "your token lacks permission for this resource";
  if (err.status === 404) return "check the slug/id; run `prysmid workspace list`";
  if (err.status === 409) return "resource already exists or in conflicting state";
  if (err.status === 422) return "validation error — see body above for fields";
  if (err.status >= 500) return "transient API error — retry or `prysmid doctor`";
  return null;
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, "..", "package.json"),
      resolve(here, "..", "..", "package.json"),
    ];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8"));
        if (typeof pkg.version === "string") return pkg.version;
      } catch { /* try next */ }
    }
  } catch { /* fallthrough */ }
  return "0.0.0";
}
