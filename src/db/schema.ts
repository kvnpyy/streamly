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
