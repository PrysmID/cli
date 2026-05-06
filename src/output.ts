/**
 * Output rendering. Two formats:
 *   - "json" (default when stdout is not a TTY, or --json) — JSON.stringify
 *   - "text" (default when stdout IS a TTY)               — pretty for humans
 *
 * Logs always go to stderr. Data always to stdout. Pipes work cleanly.
 */
export type OutputFormat = "json" | "text";

export function pickFormat(flag: string | undefined): OutputFormat {
  if (flag === "json") return "json";
  if (flag === "text") return "text";
  return process.stdout.isTTY ? "text" : "json";
}

export function emit(value: unknown, fmt: OutputFormat): void {
  if (value === undefined || value === null) {
    if (fmt === "json") process.stdout.write("null\n");
    return;
  }
  if (fmt === "json") {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    return;
  }
  // text: arrays of objects → simple table; objects → key: value; strings → as-is.
  if (typeof value === "string") {
    process.stdout.write(value + "\n");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      process.stdout.write("(empty)\n");
      return;
    }
    if (typeof value[0] === "object" && value[0] !== null) {
      process.stdout.write(renderTable(value as Record<string, unknown>[]) + "\n");
      return;
    }
    for (const v of value) process.stdout.write(String(v) + "\n");
    return;
  }
  if (typeof value === "object") {
    process.stdout.write(renderObject(value as Record<string, unknown>) + "\n");
    return;
  }
  process.stdout.write(String(value) + "\n");
}

function renderObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  const w = Math.max(...keys.map((k) => k.length));
  return keys
    .map((k) => {
      const v = obj[k];
      const s = v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k.padEnd(w)}  ${s}`;
    })
    .join("\n");
}

function renderTable(rows: Record<string, unknown>[]): string {
  const cols = uniqueKeys(rows);
  const widths: Record<string, number> = {};
  for (const c of cols) widths[c] = c.length;
  for (const r of rows) {
    for (const c of cols) {
      const cell = stringify(r[c]);
      if (cell.length > (widths[c] ?? 0)) widths[c] = cell.length;
    }
  }
  const header = cols.map((c) => c.padEnd(widths[c]!)).join("  ");
  const sep = cols.map((c) => "─".repeat(widths[c]!)).join("  ");
  const body = rows
    .map((r) => cols.map((c) => stringify(r[c]).padEnd(widths[c]!)).join("  "))
    .join("\n");
  return [header, sep, body].join("\n");
}

function uniqueKeys(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) {
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
