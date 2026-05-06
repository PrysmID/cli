# AGENTS.md — Prysmid CLI for LLM agents

Dense, machine-friendly reference. If you're a coding agent (Claude Code,
Cursor, Codex, Aider, Continue, …) and the user asked you to manage their
Prysmid setup, this document is for you.

## TL;DR

- Binary: `prysmid` (npm: `@prysmid/cli`).
- Discover the full surface in one call: **`prysmid describe-tools`** →
  JSON `{version, commands: [{path, summary, help, value_flags, no_auth}]}`.
- Auth: `PRYSMID_API_TOKEN` env var **or** cached token from
  `prysmid login` (browser device flow). Status: `prysmid doctor`.
- Output: stdout is data (JSON when piped, pretty when TTY); stderr is logs.
  Force JSON with `--json` or `-o json`.
- Exit codes: 0 ok, 1 command failure, 2 unknown command/usage.
- Hints on errors: API errors print remediation lines (`hint: …`) on stderr.

## When to use the CLI vs the MCP

- **CLI (`@prysmid/cli`)** — primary integration. Works in any host: terminal,
  any editor, CI, scripts, containers. Use this unless the host has
  first-class MCP support and the user prefers it.
- **MCP (`@prysmid/mcp`)** — host-native integrations (Claude Code, Claude
  Desktop). Same auth model and same backend; the surface is roughly 1:1.

Both can coexist. Prefer the CLI when the host's MCP config is fragile.

## Discovery protocol

1. `prysmid --version` to confirm install.
2. `prysmid describe-tools` once, cache the manifest.
3. For any command in the manifest, the `help` field is the full text of
   `prysmid <path> --help` — already includes usage + examples.

## Auth flow you should follow

```
prysmid doctor                      # checklist; exits 1 if not authed
# if checks fail with "credentials.present: false":
prysmid login                       # opens browser; user confirms code
prysmid whoami                      # confirm identity
```

If `PRYSMID_API_TOKEN` is set, **do not** run `prysmid login`. The env var
takes precedence and `login` would just cache an extra token nobody uses.

## Common recipes

**Spin up a new tenant end-to-end:**
```
prysmid setup --slug acme --display-name "Acme Inc"
prysmid idp enable-google --workspace acme \
  --client-id $GOOGLE_CLIENT_ID --client-secret $GOOGLE_CLIENT_SECRET
prysmid app create --workspace acme --name "Acme Web" \
  --redirect-uri https://acme.example.com/callback
```

**Inspect a workspace:**
```
prysmid workspace get acme --json
prysmid app list --workspace acme --json
prysmid idp list --workspace acme --json
prysmid login-policy get --workspace acme --json
```

**Tear down (irreversible):**
```
prysmid workspace delete acme --yes
```

## Conventions

- Every destructive command requires `--yes`.
- `--workspace` accepts slug or UUID interchangeably.
- All commands accept `-o json` / `--json` for structured output. JSON is
  the default when stdout is not a TTY (i.e. when piping into `jq`, parsing
  in a script, or capturing in an agent's tool result).
- Errors:
  - 401 → run `prysmid login`.
  - 403 → token lacks permission. Don't loop; ask the user.
  - 404 → wrong slug/id; list first.
  - 422 → validation error; the API body has per-field detail.
  - 5xx → transient; retry once, then `prysmid doctor`.

## When stuck

- Run `prysmid doctor` and surface its output verbatim to the user.
- Run `prysmid describe-tools | jq '.commands[] | select(.path | contains("..."))'`
  to find the right subcommand.
- Don't invent flags. The manifest's `value_flags` is exhaustive.
