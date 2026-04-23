import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),           // nullable for Google OAuth users
  googleId: text("google_id").unique(),          // null for email/password users
  role: text("role").notNull().default("user"),  // admin | user
  plan: text("plan").notNull().default("free"),  // free | starter | business | agency
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),                 // from Google profile picture
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // ── Brand / Onboarding fields ────────────────────────────────────────────
  onboardingStep: integer("onboarding_step").notNull().default(0), // 0=not started, 5=complete
  brandIndustry: text("brand_industry"),
  brandCountry: text("brand_country"),
  brandWebsite: text("brand_website"),
  brandDescription: text("brand_description"),
  brandPrimaryColor: text("brand_primary_color"),
  brandSecondaryColor: text("brand_secondary_color"),
  brandFont: text("brand_font"),
  brandFontUrl: text("brand_font_url"),          // custom uploaded font (object storage URL)
  brandTone: text("brand_tone"),                 // formal | cercano | técnico | inspiracional | divertido
  brandAudienceDesc: text("brand_audience_desc"),
  brandReferenceImages: text("brand_reference_images"), // JSON array of image URLs
  aiCredits: integer("ai_credits").notNull().default(10),  // AI generation credits
  // ── 2FA / Google Authenticator ───────────────────────────────────────────
  totpSecret: text("totp_secret"),                          // encrypted TOTP base32 secret (null = not set)
  totpEnabled: boolean("totp_enabled").notNull().default(false), // true = TOTP is required at login
  // ── Email verification ───────────────────────────────────────────────────
  emailVerified: boolean("email_verified").notNull().default(true), // default true so existing users are not affected
  emailVerificationToken: text("email_verification_token"), // null once verified
  emailVerificationExpiry: timestamp("email_verification_expiry"), // token expiry
  // ── Referrals ────────────────────────────────────────────────────────────
  myReferralCode: text("my_referral_code").unique(),   // this user's shareable referral code
  usedReferralCode: text("used_referral_code"),         // code they signed up with (if any)
  // ── Zona horaria ─────────────────────────────────────────────────────────
  timezone: text("timezone"),                           // IANA timezone (ej: "Pacific/Auckland"). null = resolver desde brandCountry
  // ── Soft-delete (papelera) ───────────────────────────────────────────────
  deletedAt: timestamp("deleted_at"),                  // null = activo, valor = en papelera (auto-purge 30 días)
  // ── Delete-account OTP (para usuarios OAuth sin contraseña ni 2FA) ──────
  deleteOtpHash: text("delete_otp_hash"),              // sha256 hex del código de 6 dígitos
  deleteOtpExpiry: timestamp("delete_otp_expiry"),     // expiración a 10 min
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
