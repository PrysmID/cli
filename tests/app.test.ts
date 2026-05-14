/**
 * Tests for `prysmid app show | update | regenerate-secret`.
 *
 * These exercise the command's `run()` function directly with a mocked
 * client, so we assert: (a) HTTP method + path + body shape we send, and
 * (b) the stdout/stderr contract for the rotate command.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appCommands } from "../src/commands/app.js";
import type { LeafCommand } from "../src/commands/types.js";
import { fakeCtx, makeFakeClient, parseFor } from "./helpers.js";

function leaf(name: string): LeafCommand {
  const c = appCommands[name];
  if (!c || c.kind !== "leaf") throw new Error(`no leaf '${name}'`);
  return c;
}

describe("prysmid app show", () => {
  it("GETs /apps/{id} under the workspace", async () => {
    const cmd = leaf("show");
    const client = makeFakeClient([{ id: "app_1", name: "Web" }]);
    const args = parseFor(cmd.valueFlags ?? [], ["app_1", "--workspace", "acme"]);

    const res = await cmd.run(args, fakeCtx(client));

    expect(client.calls).toEqual([
      { path: "/v1/workspaces/acme/apps/app_1", method: "GET", body: undefined },
    ]);
    expect(res).toEqual({ id: "app_1", name: "Web" });
  });

  it("requires the app id positional", async () => {
    const cmd = leaf("show");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], ["--workspace", "acme"]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/app id/);
  });

  it("requires --workspace", async () => {
    const cmd = leaf("show");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], ["app_1"]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/--workspace/);
  });
});

describe("prysmid app update", () => {
  it("PATCHes only the fields supplied; repeated --redirect-uri replaces the list", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient([{ id: "app_1" }]);
    const args = parseFor(cmd.valueFlags ?? [], [
      "app_1",
      "--workspace",
      "acme",
      "--redirect-uri",
      "https://a/cb",
      "--redirect-uri",
      "https://b/cb",
      "--dev-mode",
      "false",
    ]);

    await cmd.run(args, fakeCtx(client));

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.method).toBe("PATCH");
    expect(client.calls[0]!.path).toBe("/v1/workspaces/acme/apps/app_1");
    expect(client.calls[0]!.body).toEqual({
      redirect_uris: ["https://a/cb", "https://b/cb"],
      dev_mode: false,
    });
  });

  it("packs repeated --grant-type and --post-logout-redirect-uri into arrays", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient([{}]);
    const args = parseFor(cmd.valueFlags ?? [], [
      "app_1",
      "--workspace",
      "acme",
      "--grant-type",
      "authorization_code",
      "--grant-type",
      "refresh_token",
      "--post-logout-redirect-uri",
      "https://a/logout",
    ]);

    await cmd.run(args, fakeCtx(client));

    expect(client.calls[0]!.body).toEqual({
      grant_types: ["authorization_code", "refresh_token"],
      post_logout_redirect_uris: ["https://a/logout"],
    });
  });

  it("errors when no patchable field is supplied", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], ["app_1", "--workspace", "acme"]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/no fields to update/);
  });

  it("rejects non-boolean --dev-mode values", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], [
      "app_1",
      "--workspace",
      "acme",
      "--dev-mode",
      "maybe",
    ]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/dev-mode/);
  });
});

describe("prysmid app regenerate-secret", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("with --yes, POSTs and prints the secret bare on stdout with a warning to stderr", async () => {
    const cmd = leaf("regenerate-secret");
    const client = makeFakeClient([
      { client_id: "abc", client_secret: "s3cret-shhh", rotated_at: "2025-01-01T00:00:00Z" },
    ]);
    const args = parseFor(cmd.valueFlags ?? [], ["app_1", "--workspace", "acme", "--yes"]);

    const res = await cmd.run(args, fakeCtx(client));

    expect(res).toBeUndefined(); // command emitted output itself
    expect(client.calls).toEqual([
      {
        path: "/v1/workspaces/acme/apps/app_1/regenerate-secret",
        method: "POST",
        body: undefined,
      },
    ]);

    // The bare secret should be written to stdout, exactly once, on its own line.
    const stdoutWrites = stdoutSpy.mock.calls.map((c) => c[0]);
    expect(stdoutWrites).toContain("s3cret-shhh\n");
    // Nothing else should appear on stdout — pipelines depend on this.
    expect(stdoutWrites).toEqual(["s3cret-shhh\n"]);

    // The warning belongs on stderr.
    const stderrAll = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrAll).toMatch(/only time the secret will be shown/i);
  });

  it("fails loudly if the API response is missing client_secret", async () => {
    const cmd = leaf("regenerate-secret");
    const client = makeFakeClient([{ rotated_at: "now" }]);
    const args = parseFor(cmd.valueFlags ?? [], ["app_1", "--workspace", "acme", "--yes"]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/client_secret/);
  });
});
