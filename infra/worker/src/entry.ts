import OAuthProvider from "@cloudflare/agents/oauth-provider";
import { GoogleHandler } from "@cloudflare/agents/google-handler";
import { SocialsMCP, type Env } from "./src/index.ts";

export { SocialsMCP };
export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: SocialsMCP.mount("/mcp"),
  // @ts-expect-error — env types differ between default export contexts
  defaultHandler: (req: Request, env: Env, ctx: unknown, oauthInfo: unknown) =>
    GoogleHandler(req, {
      clientId: env.GOOGLE_LOGIN_CLIENT_ID,
      clientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET,
      scope: "openid email profile",
    }, env.OAUTH_KV),
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
