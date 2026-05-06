/**
 * `prysmid describe-tools` — emit a JSON manifest of every leaf command, so
 * an LLM/agent can ingest the full surface in one call instead of paging
 * through `--help` per subcommand.
 *
 * Schema:
 *   { version, commands: [{ path, summary, help, value_flags }] }
 */
import type { Command, LeafCommand } from "./types.js";

export interface ToolManifestEntry {
  path: string;
  summary: string;
  help: string;
  value_flags: ReadonlyArray<string>;
  no_auth: boolean;
}

export interface ToolManifest {
  version: string;
  commands: ToolManifestEntry[];
}

export function buildManifest(
  root: Record<string, Command>,
  cliVersion: string,
): ToolManifest {
  const out: ToolManifestEntry[] = [];
  walk(root, [], out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return { version: cliVersion, commands: out };
}

function walk(node: Record<string, Command>, path: string[], out: ToolManifestEntry[]): void {
  for (const [key, cmd] of Object.entries(node)) {
    const next = [...path, key];
    if (cmd.kind === "leaf") {
      const leaf = cmd as LeafCommand;
      out.push({
        path: next.join(" "),
        summary: leaf.summary,
        help: leaf.help.trim(),
        value_flags: leaf.valueFlags ?? [],
        no_auth: !!leaf.noAuth,
      });
    } else {
      walk(cmd.subcommands, next, out);
    }
  }
}
