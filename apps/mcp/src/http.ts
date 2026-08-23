import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, openVault, VERSION } from "./server.js";

/**
 * Stateless streamable-HTTP MCP endpoint (protocol revision 2025-06-18 / later).
 * Every POST /mcp gets a fresh transport + server pair; no session affinity —
 * safe behind load balancers and matches the recommended pattern.
 * GET/DELETE respond 405 per the stateless convention. Operational endpoints:
 * GET /health, GET /version (no auth, no PII).
 *
 * Local/self-host use: protect with SOCIALS_MCP_TOKEN (bearer) before binding
 * beyond localhost. Public multi-tenant hosting with OAuth 2.1 lives in
 * infra/worker (Cloudflare).
 */
export async function runHttpServer(port: number): Promise<void> {
  const token = process.env.SOCIALS_MCP_TOKEN;
  const allowedOrigins = (process.env.SOCIALS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: VERSION, uptimeSec: Math.round(process.uptime()) }));
      return;
    }
    if (url.pathname === "/version") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ name: "socials-mcp", version: VERSION, node: process.version }));
      return;
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", hint: "POST /mcp · GET /health · GET /version" }));
      return;
    }

    // DNS-rebinding defense: browsers always send Origin on cross-site POSTs.
    const origin = req.headers.origin;
    if (origin) {
      const host = new URL(origin).hostname;
      const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
      const allowed = allowedOrigins.includes(origin) || allowedOrigins.includes(host);
      if (!local && !allowed) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "origin_forbidden", fix: "Add the caller to SOCIALS_ALLOWED_ORIGINS (comma-separated)." }));
        return;
      }
    }

    if (token) {
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${token}`) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Bearer realm="socials-mcp"' });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        if (err.status === 413) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message ?? "bad request" }));
        return;
      }
      try {
        const vault = openVault();
        const server = buildServer(vault);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          transport.close();
          server.close();
          vault.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }
    res.writeHead(405, { "content-type": "application/json", allow: "POST" });
    res.end(JSON.stringify({ error: "method_not_allowed", note: "stateless server: POST only" }));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, () => resolve()));
  console.error(
    `[socials-mcp] streamable HTTP listening on http://127.0.0.1:${port}/mcp` +
      (token ? " (bearer token required)" : "") +
      (allowedOrigins.length ? ` (extra origins: ${allowedOrigins.join(", ")})` : "")
  );

  // Graceful shutdown for Docker / systemd
  const shutdown = () => {
    console.error("\n[socials-mcp] shutting down…");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000); // force-kill after 5s
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 1_048_576; // 1 MB
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > MAX_BYTES) {
        req.destroy();
        reject({ status: 413, message: "payload_too_large" });
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
