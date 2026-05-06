# @prysmid/cli

Official Prysmid command-line interface. Manage workspaces, OIDC apps,
identity providers, login policies, branding, users, and billing from any
terminal, script, agent, or CI pipeline.

```bash
npm install -g @prysmid/cli
prysmid login
prysmid workspace list
```

## Why a CLI?

Prysmid also ships an MCP server (`@prysmid/mcp`) for hosts that natively
support the Model Context Protocol (Claude Code, Claude Desktop). The CLI
is the **portable** path: it works anywhere POSIX works — Cursor, Codex
Desktop, Continue, plain terminals, GitHub Actions, Dockerfiles, scripts.

Modern coding agents (Claude Code, Cursor agent, Codex, Aider, …) discover
CLIs automatically via `--help` and can use this CLI without per-host
configuration. See [AGENTS.md](./AGENTS.md) for the agent-oriented quick
reference.

## Install

```bash
# Node 20+ required
npm install -g @prysmid/cli
```

Or run on demand:
```bash
npx @prysmid/cli --help
```

## Authenticate

Two modes:

### Interactive (browser)
```bash
prysmid login
```
Opens a verification URL, you confirm a code in the browser, the token is
cached under `~/.config/prysmid/prysmid.json` (or `%APPDATA%\prysmid\…` on
Windows). Survives across shells and reboots.

### Non-interactive (CI / scripts)
```bash
export PRYSMID_API_TOKEN=pat_...
prysmid workspace list
```

## Quick tour

```bash
prysmid --help
prysmid workspace list
prysmid setup --slug acme --display-name "Acme Inc"
prysmid idp enable-google --workspace acme \
  --client-id $GOOGLE_CLIENT_ID --client-secret $GOOGLE_CLIENT_SECRET
prysmid app create --workspace acme --name "Web" \
  --redirect-uri https://acme.example.com/callback
prysmid login-policy update --workspace acme --force-mfa true
prysmid doctor
```

## Output

- Pretty text when stdout is a TTY.
- JSON when piped (or pass `-o json` / `--json`).
- Logs go to **stderr**, never to stdout — pipe stdout into `jq` safely.

## Profiles

Switch between accounts/environments:
```bash
prysmid login --profile staging
prysmid workspace list --profile staging
```

## For agents

```bash
prysmid describe-tools     # JSON manifest of every command
```

See [AGENTS.md](./AGENTS.md).

## License

Apache-2.0.
