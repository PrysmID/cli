/**
 * Tiny helpers for interactive prompts and stdin/file secret ingestion.
 *
 * Design notes:
 *   - We never echo secrets. `readSecretFromStdin` reads the whole stdin to
 *     end and trims a single trailing newline so `echo $SECRET | prysmid ...`
 *     and `prysmid ... <<<$SECRET` both work.
 *   - `confirm` writes the prompt to stderr (so stdout stays clean for data)
 *     and reads from stdin. If stdin is not a TTY we refuse the prompt — the
 *     caller is expected to pass --yes in non-interactive contexts.
 */
import { readFileSync } from "node:fs";

export async function readSecretFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    process.stdin.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    process.stdin.on("end", () => resolve());
    process.stdin.on("error", reject);
  });
  const raw = Buffer.concat(chunks).toString("utf8");
  // Strip a single trailing newline (\n or \r\n) — common with `echo` / heredocs.
  return raw.replace(/\r?\n$/, "");
}

export function readSecretFromFile(path: string): string {
  const raw = readFileSync(path, "utf8");
  return raw.replace(/\r?\n$/, "");
}

/**
 * Show `prompt` on stderr and read a single line from stdin. Returns true iff
 * the user typed exactly "yes" (case-insensitive). If stdin is not a TTY,
 * returns false without prompting — destructive commands should require an
 * explicit --yes in scripts.
 */
export async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  process.stderr.write(prompt);
  const line = await new Promise<string>((resolve) => {
    let buf = "";
    const onData = (c: Buffer | string): void => {
      buf += typeof c === "string" ? c : c.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        process.stdin.off("data", onData);
        // best-effort: pause so we don't keep the event loop open
        try { process.stdin.pause(); } catch { /* ignore */ }
        resolve(buf.slice(0, nl).trim());
      }
    };
    process.stdin.on("data", onData);
    try { process.stdin.resume(); } catch { /* ignore */ }
  });
  return line.toLowerCase() === "yes";
}
