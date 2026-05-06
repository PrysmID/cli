/**
 * Tiny argv parser — no external deps. Recognizes:
 *   - long flags:  --foo, --foo=value, --foo value
 *   - short flags: -q, -v
 *   - boolean flags (e.g. --json, --quiet) — no value follows
 *   - positional args (everything else, in order)
 *   - "--" stops parsing; remaining tokens are positional verbatim
 *
 * Callers declare which flags expect a value; everything else is treated as a
 * boolean. Unknown flags are not errors here — leaf commands decide.
 */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export interface ParseSpec {
  /** Flags that expect a value: ["--workspace", "-w", "--profile", ...] */
  valueFlags: ReadonlyArray<string>;
  /** Aliases: short → long, e.g. { "-w": "--workspace" } */
  aliases?: Readonly<Record<string, string>>;
}

export function parseArgs(argv: string[], spec: ParseSpec): ParsedArgs {
  const out: ParsedArgs = { positional: [], flags: {} };
  const aliases = spec.aliases ?? {};
  const valueFlags = new Set(spec.valueFlags);

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok === "--") {
      out.positional.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      const name = eq >= 0 ? tok.slice(0, eq) : tok;
      if (eq >= 0) {
        out.flags[name] = tok.slice(eq + 1);
      } else if (valueFlags.has(name) && i + 1 < argv.length) {
        out.flags[name] = argv[++i]!;
      } else {
        out.flags[name] = true;
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      const name = aliases[tok] ?? tok;
      if (valueFlags.has(name) && i + 1 < argv.length) {
        out.flags[name] = argv[++i]!;
      } else {
        out.flags[name] = true;
      }
    } else {
      out.positional.push(tok);
    }
    i++;
  }
  return out;
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === "true";
}
