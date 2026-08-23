/** Per-platform developer-app configuration the creator provides during onboarding. */
export interface PlatformAppConfig {
  /** Google OAuth client (YouTube) */
  googleClientId?: string;
  googleClientSecret?: string;
  /** Meta app (Instagram + Facebook) */
  metaAppId?: string;
  metaAppSecret?: string;
  /** TikTok developer app */
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
}

export function loadAppConfig(): PlatformAppConfig {
  return {
    googleClientId: process.env.SOCIALS_GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.SOCIALS_GOOGLE_CLIENT_SECRET,
    metaAppId: process.env.SOCIALS_META_APP_ID,
    metaAppSecret: process.env.SOCIALS_META_APP_SECRET,
    tiktokClientKey: process.env.SOCIALS_TIKTOK_CLIENT_KEY,
    tiktokClientSecret: process.env.SOCIALS_TIKTOK_CLIENT_SECRET,
  };
}

export function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}

export const OAUTH_PORT = Number(process.env.SOCIALS_OAUTH_PORT ?? 8399);

/** Thrown when a required platform app credential is missing. */
export class MissingConfigError extends Error {
  constructor(public readonly keys: string[], platform: string) {
    super(
      `Missing ${platform} app credentials: ${keys.join(", ")}. ` +
        `Set them via environment variables or \`socials-mcp config set <key> <value>\`. ` +
        `See docs/onboarding for creating the ${platform} developer app (free, ~10 min).`
    );
    this.name = "MissingConfigError";
  }
}
