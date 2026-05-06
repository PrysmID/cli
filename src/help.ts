/**
 * Renders `prysmid --help` (root) and `prysmid <group> --help` listings.
 * Dense, no pagination — agents read it in one shot.
 */
import type { Command, GroupCommand } from "./commands/types.js";

export function renderRootHelp(
  root: Record<string, Command>,
  version: string,
): string {
  const lines: string[] = [];
  lines.push(`prysmid v${version} — Official Prysmid CLI`);
  lines.push("");
  lines.push("USAGE");
  lines.push("  prysmid <command> [subcommand] [flags]");
  lines.push("");
  lines.push("COMMANDS");
  for (const [name, cmd] of Object.entries(root)) {
    lines.push(`  ${name.padEnd(16)}  ${cmd.summary}`);
    if (cmd.kind === "group") {
      for (const [subName, sub] of Object.entries(cmd.subcommands)) {
        lines.push(`    ${name} ${subName.padEnd(14 - name.length)}  ${sub.summary}`);
      }
    }
  }
  lines.push("");
  lines.push("GLOBAL FLAGS");
  lines.push("  -o, --output text|json   Output format (default: json when piped, text on TTY)");
  lines.push("      --json               Shortcut for --output json");
  lines.push("  -q, --quiet              Suppress info logs on stderr");
  lines.push("  -v, --verbose            Debug logs on stderr");
  lines.push("      --profile <name>     Credentials profile (default: prysmid)");
  lines.push("      --api-base <url>     Override API base URL");
  lines.push("  -h, --help               Show help for the current command");
  lines.push("      --version            Show CLI version");
  lines.push("");
  lines.push("ENVIRONMENT");
  lines.push("  PRYSMID_API_TOKEN        Static bearer token (skips device flow)");
  lines.push("  PRYSMID_API_BASE         Override API base URL");
  lines.push("  PRYSMID_PROFILE          Default --profile value");
  lines.push("  PRYSMID_LOG_LEVEL        debug|info|warn|error (default: warn)");
  lines.push("");
  lines.push("AGENTS");
  lines.push("  Run `prysmid describe-tools` to get a JSON manifest of every");
  lines.push("  command (path, summary, help, flags). See AGENTS.md.");
  lines.push("");
  lines.push("DOCS    https://docs.prysmid.com    BUGS    https://github.com/PrysmID/cli/issues");
  return lines.join("\n");
}

export function renderGroupHelp(name: string, group: GroupCommand): string {
  const lines: string[] = [];
  lines.push(`prysmid ${name} — ${group.summary}`);
  lines.push("");
  lines.push("SUBCOMMANDS");
  for (const [subName, sub] of Object.entries(group.subcommands)) {
    lines.push(`  ${subName.padEnd(16)}  ${sub.summary}`);
  }
  lines.push("");
  lines.push(`Run \`prysmid ${name} <subcommand> --help\` for details.`);
  return lines.join("\n");
}
