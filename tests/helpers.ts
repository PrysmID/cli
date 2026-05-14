/**
 * Test helpers — shared fakes for the command tests.
 *
 * Commands call `ctx.client.request(path, opts?)` exclusively for HTTP. We
 * never want a real fetch in tests, so we hand each command a `FakeClient`
 * that records the call shape and replays a canned response.
 */
import type { ParsedArgs } from "../src/args.js";
import { parseArgs } from "../src/args.js";

export interface RecordedCall {
  path: string;
  method: string;
  body?: unknown;
}

export interface FakeClient {
  request: <T = unknown>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>;
  calls: RecordedCall[];
  apiBase: string;
}

export function makeFakeClient(responses: unknown[] = [{}]): FakeClient {
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  return {
    apiBase: "https://api.test",
    calls,
    request: async <T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}) => {
      calls.push({ path, method: opts.method ?? "GET", body: opts.body });
      const next = queue.length > 0 ? queue.shift() : {};
      return next as T;
    },
  };
}

export function fakeCtx(client: FakeClient) {
  return {
    client: client as unknown as import("../src/core/client.js").PrysmidClient,
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    cfg: {
      apiBase: client.apiBase,
      apiToken: "test-token",
      profile: "test",
      logLevel: "error" as const,
    } as unknown as import("../src/core/config.js").Config,
  };
}

/** Parse argv exactly as the dispatcher would for a leaf with the given valueFlags. */
export function parseFor(valueFlags: ReadonlyArray<string>, argv: string[]): ParsedArgs {
  return parseArgs(argv, { valueFlags });
}
