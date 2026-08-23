# Security Policy

## Design principles

- **Official APIs only.** No scraping, no automation of logged-in platform sessions (TikTok ToS risk).
- **Local-first data.** The vault is SQLite on the user's machine by default; nothing leaves unless the user deploys the Worker themselves.
- **Tokens encrypted at rest** (AES-256-GCM; key file `~/.socials-assistant/key`, mode 0600). Tokens are never returned by any MCP tool, never logged, never embedded in URLs.
- **Draft-first outreach.** No tool sends email. `SOCIALS_ALLOW_SEND` gates any send automation the user wires separately.
- **Read-only query surface.** `vault_query` accepts a single SELECT; writes/DDL are rejected.

## HTTP mode

Set `SOCIALS_MCP_TOKEN` before binding HTTP mode to anything beyond localhost. The server validates `Origin` headers on MCP requests.

## Cloud deployment

The Cloudflare Worker stores per-user platform tokens encrypted under `TOKEN_ENCRYPTION_KEY` (a Worker secret). Rotate by re-deploying with a new key (users re-connect platforms). Use OAuth 2.1 with DCR so agents never share credentials.

## Reporting a vulnerability

Please open a security advisory: GitHub → Security → Advisories → "Report a vulnerability". Do not open public issues for vulnerabilities. Response target: 72 hours.
