import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";

/**
 * Minimal local OAuth 2.0 / PKCE helper for desktop-style flows:
 * opens nothing itself — returns an authorize URL for the agent/user to open,
 * runs a localhost callback server, and resolves with ?code= once the platform
 * redirects back. Works for Google, Meta, and TikTok (PKCE).
 */
export interface LocalOAuthParams {
  authorizeUrl: string; // full URL with client_id, scope, redirect_uri, state, pkce params
  port: number;
  state: string;
  timeoutMs?: number;
  /** Called with the callback URL when hit, before resolving (for user feedback). */
  onStart?: (url: string) => void;
}

export interface LocalOAuthResult {
  code: string;
  fullUrl: string;
  query: Record<string, string>;
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function waitForCallback(p: LocalOAuthParams): Promise<LocalOAuthResult> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${p.port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (query.error) {
        res.end(`<h2>Authorization failed</h2><p>${escapeHtml(query.error_description ?? query.error)}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${query.error_description ?? query.error}`));
        return;
      }
      if (query.state !== p.state) {
        res.end("<h2>State mismatch</h2><p>Possible CSRF — aborted. Try connecting again.</p>");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }
      res.end("<h2>✅ Authorized</h2><p>You can close this tab and return to your agent.</p>");
      server.close();
      resolve({ code: query.code ?? "", fullUrl: url.toString(), query });
    });
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error(`Timed out waiting for OAuth callback on port ${p.port} (open the authorize URL and complete consent).`));
    }, p.timeoutMs ?? 300_000);
    server.listen(p.port, "127.0.0.1", () => {
      p.onStart?.(`http://127.0.0.1:${p.port}/callback`);
    });
    server.on("close", () => clearTimeout(timeout));
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** JSON fetch helper with useful error bodies. */
export async function jsonFetch<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!res.ok) {
      const detail = typeof body === "object" && body !== null ? JSON.stringify(body) : String(body);
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${detail.slice(0, 500)}`);
    }
    return body as T;
  } finally {
    clearTimeout(t);
  }
}
