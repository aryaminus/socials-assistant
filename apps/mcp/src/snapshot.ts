import { openVault, readConfigFile } from "./server.js";
import type { Vault } from "@socials/vault";
import { loadAppConfig, snapshotYoutube, snapshotMeta, snapshotTiktok, type GoogleTokens, type MetaIdentity, type TiktokTokens } from "@socials/connectors";
import type { NormalizedSnapshot } from "@socials/shared";

/** Headless snapshot used by `socials-mcp snapshot` CLI and cron automation. */
export async function snapshotAll(vault: Vault, days = 28): Promise<Record<string, unknown>> {
  const cfg = { ...readConfigFile(), ...loadAppConfig() };
  const results: Record<string, unknown> = {};
  for (const acct of vault.listAccounts()) {
    try {
      const creds = vault.getCredentials(acct.id);
      if (!creds) throw new Error("no stored credentials — re-connect");
      let snap: NormalizedSnapshot | undefined;
      if (acct.platform === "youtube") {
        snap = await snapshotYoutube(
          cfg,
          { access_token: creds.accessToken, refresh_token: creds.refreshToken, expires_at: creds.expiresAt, expires_in: 0 } satisfies GoogleTokens,
          (t) => vault.setCredentials(acct.id, { accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: t.expires_at }),
          days
        );
      } else if (acct.platform === "instagram" || acct.platform === "facebook") {
        const identityRaw = vault.metaGet(`identity:${acct.platform}:${acct.id}`);
        const identity: MetaIdentity = identityRaw
          ? JSON.parse(identityRaw)
          : {
              pageId: String(creds.extra?.pageId ?? acct.platformAccountId),
              pageName: acct.displayName ?? "Page",
              igUserId: creds.extra?.igUserId ? String(creds.extra.igUserId) : undefined,
            };
        const snaps = await snapshotMeta(
          cfg,
          { access_token: creds.accessToken, expires_at: creds.expiresAt },
          identity,
          (t) => vault.setCredentials(acct.id, { ...creds, accessToken: t.access_token, expiresAt: t.expires_at }),
          days
        );
        snap = acct.platform === "instagram" ? snaps.instagram : snaps.facebook;
      } else if (acct.platform === "tiktok") {
        snap = await snapshotTiktok(
          cfg,
          {
            access_token: creds.accessToken,
            refresh_token: creds.refreshToken,
            open_id: String(creds.extra?.open_id ?? acct.platformAccountId),
            expires_at: creds.expiresAt,
          } satisfies TiktokTokens,
          (t) => vault.setCredentials(acct.id, { ...creds, accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: t.expires_at })
        );
      }
      if (snap) results[acct.platform] = vault.storeSnapshot(acct.id, snap, "api:cron");
    } catch (e) {
      results[acct.platform] = { error: (e as Error).message };
    }
  }
  return results;
}

export { openVault };
