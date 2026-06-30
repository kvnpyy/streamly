import { primaryKey, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stream app login (email + password hash). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  /** When set, the user completed email verification (or was grandfathered). */
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
  /** Opt-in to product updates (not transactional mail). */
  marketingOptIn: integer("marketing_opt_in", { mode: "boolean" })
    .notNull()
    .default(false),
  marketingOptInAt: integer("marketing_opt_in_at", { mode: "timestamp_ms" }),
  marketingUnsubscribedAt: integer("marketing_unsubscribed_at", {
    mode: "timestamp_ms",
  }),
  welcomeEmailSentAt: integer("welcome_email_sent_at", { mode: "timestamp_ms" }),
  /** Last activated `iptv_provider_accounts.id` — synced across devices for Streamly users. */
  activeIptvProviderAccountId: text("active_iptv_provider_account_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** One-time links for verify-email and password-reset flows. */
export const authTokens = sqliteTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Encrypted Xtream credentials linked to a Stream user. */
export const iptvProviderAccounts = sqliteTable("iptv_provider_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Cloud-synced favorites per Stream user + Xtream login (`server|username`). */
export const userProviderFavorites = sqliteTable(
  "user_provider_favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountKey: text("provider_account_key").notNull(),
    favoritesJson: text("favorites_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.providerAccountKey] })]
);

export type User = typeof users.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type IptvProviderAccount = typeof iptvProviderAccounts.$inferSelect;
export type UserProviderFavorites = typeof userProviderFavorites.$inferSelect;

/** Cloud-synced recently watched + VOD resume per Stream user + Xtream login. */
export const userProviderWatchState = sqliteTable(
  "user_provider_watch_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountKey: text("provider_account_key").notNull(),
    recentsJson: text("recents_json").notNull(),
    vodResumeJson: text("vod_resume_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.providerAccountKey] })]
);

export type UserProviderWatchState = typeof userProviderWatchState.$inferSelect;

/** TMDB weekly trending cache for discovery shelves (Phase 1). */
export const discoveryTmdbCache = sqliteTable("discovery_tmdb_cache", {
  id: text("id").primaryKey(),
  region: text("region").notNull().default("US"),
  mediaType: text("media_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
});

export type DiscoveryTmdbCache = typeof discoveryTmdbCache.$inferSelect;

/** BALLDONTLIE MMA events cache for sports discovery shelves (Phase 3). */
export const discoverySportsCache = sqliteTable("discovery_sports_cache", {
  id: text("id").primaryKey(),
  region: text("region").notNull().default("US"),
  payloadJson: text("payload_json").notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
});

export type DiscoverySportsCache = typeof discoverySportsCache.$inferSelect;

/** One-time TV linking PINs — persisted so multi-instance / restart-safe pairing works. */
export const tvPairCodes = sqliteTable("tv_pair_codes", {
  pin: text("pin").primaryKey(),
  /** AES-256-GCM encrypted `{ creds }` — same format as session cookies. */
  payload: text("payload").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Per-IP redeem attempt buckets for TV PIN pairing. */
export const tvPairRedeemBuckets = sqliteTable("tv_pair_redeem_buckets", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
});

export type TvPairCode = typeof tvPairCodes.$inferSelect;
export type TvPairRedeemBucket = typeof tvPairRedeemBuckets.$inferSelect;
