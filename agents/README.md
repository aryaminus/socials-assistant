# Add socials-mcp to any agent

One server, every agent. Local mode runs on your machine (SQLite vault); cloud mode is one URL (see `docs/hosting-cloudflare.md`).

> Replace `/path/to/socials-assistant` with your clone path. Or skip cloning entirely: `npx @aryaminus/socials-mcp` serves the same MCP server.

## Claude Code (project)

Already included as `.mcp.json` in this repo. For another project:

```json
{
  "mcpServers": {
    "socials": { "command": "node", "args": ["/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"] }
  }
}
```

Or remote (cloud): `claude mcp add --transport http socials https://your-worker.workers.dev/mcp`

## Claude Desktop (Settings → Developer → Edit Config)

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "socials": {
      "command": "node",
      "args": ["/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"]
    }
  }
}
```

Cloud mode: Settings → Connectors → Add custom connector → `https://your-worker.workers.dev/mcp`

## Codex CLI / Codex cloud / ChatGPT desktop (`~/.codex/config.toml`)

```toml
[mcp_servers.socials]
command = "node"
args = ["/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"]

# Remote (cloud) instead:
# [mcp_servers.socials]
# url = "https://your-worker.workers.dev/mcp"
# then: codex mcp login socials
```

## Gemini CLI (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "socials": {
      "command": "node",
      "args": ["/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"]
    }
  }
}
```

## Google Antigravity (`~/.gemini/antigravity/mcp_config.json` or workspace file, or `/mcp` manager)

```json
{
  "mcpServers": {
    "socials": {
      "command": "node",
      "args": ["/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"]
    }
  }
}
```

## opencode (project `opencode.json` or `~/.config/opencode/opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "socials": {
      "type": "local",
      "command": ["node", "/path/to/socials-assistant/apps/mcp/bin/socials-mcp.js"],
      "environment": { "SOCIALS_DATA_DIR": "/path/to/socials-assistant/.socials-data" }
    }
  }
}
```

## HTTP mode (any agent on your LAN / self-host)

```bash
node apps/mcp/bin/socials-mcp.js --http 3344
# optionally protect: SOCIALS_MCP_TOKEN=secretprefix
```

Endpoint: `http://127.0.0.1:3344/mcp` — add as a remote/HTTP MCP server in any client above that supports it.

## Email sending (optional, draft-first by default)

- **Drafts**: official Gmail remote MCP (`https://gmailmcp.googleapis.com/mcp/v1`, Workspace preview) or Anthropic's built-in Gmail connector — draft-only by design.
- **Sending**: Resend remote MCP — `https://mcp.resend.com/mcp` (free 3k emails/mo) — add the same way as any remote server; keep drafts-first until you trust it.

## Skills

Copy `skills/*/` into your agent's skills directory (e.g. Claude Code: `~/.claude/skills/`, opencode: `.opencode/skills/`, or reference them from this repo). The four skills: `socials-connect`, `weekly-digest`, `brand-outreach`, `media-kit`.
