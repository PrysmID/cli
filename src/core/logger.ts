/**
 * stderr logger. stdout is reserved for command output (text or JSON), so the
 * agent/script consuming us can pipe stdout safely.
 */
import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug: (msg: string, extra?: unknown) => void;
  info: (msg: string, extra?: unknown) => void;
  warn: (msg: string, extra?: unknown) => void;
  error: (msg: string, extra?: unknown) => void;
}

export function makeLogger(level: LogLevel): Logger {
  const threshold = ORDER[level];
  function emit(lvl: LogLevel, msg: string, extra?: unknown) {
    if (ORDER[lvl] < threshold) return;
    const tail = extra === undefined ? "" : ` ${safe(extra)}`;
    process.stderr.write(`prysmid: ${lvl} ${msg}${tail}\n`);
  }
  return {
    debug: (m, e) => emit("debug", m, e),
    info: (m, e) => emit("info", m, e),
    warn: (m, e) => emit("warn", m, e),
    error: (m, e) => emit("error", m, e),
  };
}

function safe(x: unknown): string {
  try { return JSON.stringify(x); } catch { return String(x); }
}
