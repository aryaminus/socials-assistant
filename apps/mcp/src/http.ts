import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, openVault } from "./server.js";

/**
 * Stateless streamable-HTTP MCP endpoint (protocol revision 2025-03-26 / later).
 * Every POST /mcp gets a fresh transport + server pair; no session affinity —
 * safe behind load balancers and matches the current recommended pattern.
 * GET/DELETE respond 405 per the stateless convention.
 *
 * NOTE: this local HTTP mode is for LAN/self-host use with a bearer token
 * (SOCIALS_MCP_TOKEN). Public multi-tenant hosting with OAuth 2.1 lives in
 * infra/worker (Cloudflare).
 */
export async function runHttpServer(port: number): Promise<void> {
  const token = process.env.SOCIALS_MCP_TOKEN;

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", hint: "POST /mcp" }));
      return;
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
      const body = await readBody(req);
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
  console.error(`[socials-mcp] streamable HTTP listening on http://127.0.0.1:${port}/mcp${token ? " (bearer token required)" : ""}`);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
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
