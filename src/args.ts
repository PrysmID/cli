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
 *
 * Repeated value flags: every occurrence is captured. `flagString` returns
 * the LAST value (back-compat with single-valued callers); `flagAll` returns
 * the full ordered list. This lets commands like `app update --redirect-uri a
 * --redirect-uri b` express full-replacement lists without comma encoding.
 */
export interface ParsedArgs {
  positional: string[];
  /** Last value seen for each flag (back-compat single-value view). */
  flags: Record<string, string | boolean>;
  /** Every value seen for each flag, in order. Booleans appear as "true". */
  multi: Record<string, string[]>;
}

export interface ParseSpec {
  /** Flags that expect a value: ["--workspace", "-w", "--profile", ...] */
  valueFlags: ReadonlyArray<string>;
  /** Aliases: short → long, e.g. { "-w": "--workspace" } */
  aliases?: Readonly<Record<string, string>>;
}

export function parseArgs(argv: string[], spec: ParseSpec): ParsedArgs {
  const out: ParsedArgs = { positional: [], flags: {}, multi: {} };
  const aliases = spec.aliases ?? {};
  const valueFlags = new Set(spec.valueFlags);

  const record = (name: string, value: string | boolean): void => {
    out.flags[name] = value;
    const s = typeof value === "string" ? value : "true";
    (out.multi[name] ??= []).push(s);
  };

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
        record(name, tok.slice(eq + 1));
      } else if (valueFlags.has(name) && i + 1 < argv.length) {
        record(name, argv[++i]!);
      } else {
        record(name, true);
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      const name = aliases[tok] ?? tok;
      if (valueFlags.has(name) && i + 1 < argv.length) {
        record(name, argv[++i]!);
      } else {
        record(name, true);
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

/**
 * Returns every value passed for `name`, in order. Use this for flags that may
 * legitimately repeat (e.g. `--redirect-uri a --redirect-uri b`). Returns
 * `undefined` if the flag was not supplied at all — distinct from `[]`.
 */
export function flagAll(args: ParsedArgs, name: string): string[] | undefined {
  const vs = args.multi[name];
  if (!vs) return undefined;
  // Drop any boolean appearances (which our parser stores as "true") if the
  // flag was sometimes used without a value. For value flags this is a no-op.
  return vs;
}
