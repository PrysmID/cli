/**
 * Tests for `prysmid idp show | update`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { idpCommands } from "../src/commands/idp.js";
import type { LeafCommand } from "../src/commands/types.js";
import { fakeCtx, makeFakeClient, parseFor } from "./helpers.js";

function leaf(name: string): LeafCommand {
  const c = idpCommands[name];
  if (!c || c.kind !== "leaf") throw new Error(`no leaf '${name}'`);
  return c;
}

describe("prysmid idp show", () => {
  it("GETs /idps/{id} under the workspace", async () => {
    const cmd = leaf("show");
    const client = makeFakeClient([{ id: "idp_1", name: "Google" }]);
    const args = parseFor(cmd.valueFlags ?? [], ["idp_1", "--workspace", "acme"]);

    const res = await cmd.run(args, fakeCtx(client));

    expect(client.calls).toEqual([
      { path: "/v1/workspaces/acme/idps/idp_1", method: "GET", body: undefined },
    ]);
    expect(res).toEqual({ id: "idp_1", name: "Google" });
  });
});

describe("prysmid idp update", () => {
  it("PATCHes only the supplied fields", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient([{}]);
    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--name",
      "Acme Google",
    ]);

    await cmd.run(args, fakeCtx(client));

    expect(client.calls[0]).toEqual({
      path: "/v1/workspaces/acme/idps/idp_1",
      method: "PATCH",
      body: { name: "Acme Google" },
    });
  });

  it("repeated --scope replaces the scopes list", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient([{}]);
    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--scope",
      "openid",
      "--scope",
      "email",
      "--scope",
      "profile",
    ]);

    await cmd.run(args, fakeCtx(client));
    expect(client.calls[0]!.body).toEqual({
      scopes: ["openid", "email", "profile"],
    });
  });

  it("reads client_secret from a file and includes it in the PATCH body", async () => {
    const cmd = leaf("update");
    const dir = mkdtempSync(join(tmpdir(), "prysmid-cli-test-"));
    const path = join(dir, "secret.txt");
    writeFileSync(path, "file-secret-xyz\n", "utf8");

    const client = makeFakeClient([{}]);
    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--client-secret-from-file",
      path,
    ]);

    await cmd.run(args, fakeCtx(client));
    expect(client.calls[0]!.body).toEqual({ client_secret: "file-secret-xyz" });
  });

  it("rejects the --client-secret flag (would leak to shell history)", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient();
    // Pass --client-secret as a bare flag (the parser will see it as boolean
    // since it's deliberately NOT in valueFlags).
    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--client-secret",
      "supersecret",
    ]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(
      /not supported|shell history/i,
    );
  });

  it("refuses both --client-secret-from-stdin and --client-secret-from-file", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--client-secret-from-stdin",
      "--client-secret-from-file",
      "/tmp/x",
    ]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/exactly one/);
  });

  it("errors when nothing is supplied to patch", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient();
    const args = parseFor(cmd.valueFlags ?? [], ["idp_1", "--workspace", "acme"]);
    await expect(cmd.run(args, fakeCtx(client))).rejects.toThrow(/no fields to update/);
  });

  it("reads client_secret from stdin (mocked)", async () => {
    const cmd = leaf("update");
    const client = makeFakeClient([{}]);

    // Replace the prompt module's stdin reader by intercepting the import.
    // Simpler: write a real value to a temp file and use --from-file in
    // the file test above; for the stdin path we override the function by
    // dynamic mocking.
    const promptModule = await import("../src/core/prompt.js");
    const spy = vi.spyOn(promptModule, "readSecretFromStdin").mockResolvedValue("piped-secret");

    const args = parseFor(cmd.valueFlags ?? [], [
      "idp_1",
      "--workspace",
      "acme",
      "--client-secret-from-stdin",
    ]);

    await cmd.run(args, fakeCtx(client));
    expect(spy).toHaveBeenCalledOnce();
    expect(client.calls[0]!.body).toEqual({ client_secret: "piped-secret" });
    spy.mockRestore();
  });
});

describe("argv parser — multi-value flags", () => {
  it("flagAll captures every occurrence of a repeated value flag", async () => {
    const { parseArgs, flagAll } = await import("../src/args.js");
    const parsed = parseArgs(["--scope", "openid", "--scope", "email"], {
      valueFlags: ["--scope"],
    });
    expect(flagAll(parsed, "--scope")).toEqual(["openid", "email"]);
  });

  it("flagAll returns undefined when the flag is absent", async () => {
    const { parseArgs, flagAll } = await import("../src/args.js");
    const parsed = parseArgs(["pos"], { valueFlags: ["--scope"] });
    expect(flagAll(parsed, "--scope")).toBeUndefined();
  });
});
