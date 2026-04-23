import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, subscriptionsTable, plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, setAuthCookie } from "../lib/auth.js";
import { buildPlanSnapshot } from "../lib/planCaps.js";
import crypto from "crypto";

const router = Router();

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";

function getRedirectUri(req: { headers: Record<string, string | string[] | undefined> }): string {
  const host = req.headers["x-forwarded-host"] as string || req.headers["host"] as string || "";
  const proto = req.headers["x-forwarded-proto"] as string || "https";
  const base = process.env["APP_URL"]
    || (process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : `${proto}://${host}`);
  return `${base}/api/auth/google/callback`;
}

// GET /api/auth/google — redirect to Google consent screen
router.get("/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(503).send("Google OAuth no está configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en los secrets del proyecto.");
  }
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  const redirectUri = getRedirectUri(req as unknown as { headers: Record<string, string | string[] | undefined> });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/google/callback — handle Google response
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect("/?google_error=cancelled");
  }

  // Validate CSRF state
  const savedState = (req.cookies as Record<string, string>)?.["google_oauth_state"];
  res.clearCookie("google_oauth_state");
  if (!state || state !== savedState) {
    return res.redirect("/login?google_error=invalid_state");
  }

  if (!code) {
    return res.redirect("/login?google_error=no_code");
  }

  try {
    const redirectUri = getRedirectUri(req as unknown as { headers: Record<string, string | string[] | undefined> });

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokens = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      console.error("[Google OAuth] Token exchange failed:", tokens);
      return res.redirect("/login?google_error=token_failed");
    }

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userInfoRes.json() as {
      id: string;
      email: string;
      name?: string;
      picture?: string;
      verified_email?: boolean;
    };

    if (!googleUser.email) {
      return res.redirect("/login?google_error=no_email");
    }

    // Find existing user by googleId or email
    let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleUser.id));

    if (!user) {
      // Try by email (existing email/password account)
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, googleUser.email.toLowerCase()));
    }

    if (user) {
      // Link Google ID if not already linked
      if (!user.googleId) {
        await db.update(usersTable)
          .set({ googleId: googleUser.id, avatarUrl: googleUser.picture, updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
      }
      if (user.isActive !== "true") {
        return res.redirect("/login?google_error=account_disabled");
      }
    } else {
      // New user — create account
      const isFirst = (await db.select({ id: usersTable.id }).from(usersTable).limit(1)).length === 0;
      const role = isFirst ? "admin" : "user";
      const plan = isFirst ? "agency" : "free";

      const [newUser] = await db.insert(usersTable).values({
        email: googleUser.email.toLowerCase(),
        passwordHash: null,
        googleId: googleUser.id,
        displayName: googleUser.name || googleUser.email.split("@")[0],
        avatarUrl: googleUser.picture,
        role,
        plan,
      }).returning();

      user = newUser;

      // Create subscription — snapshot full plan config at creation time
      const [planRow] = await db.select().from(plansTable).where(eq(plansTable.key, plan)).limit(1);
      const credits = planRow?.creditsPerMonth ?? 40;
      const lockedPlanConfig = planRow ? buildPlanSnapshot(planRow) : null;
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);
      await db.insert(subscriptionsTable).values({
        userId: user.id,
        plan,
        status: "active",
        creditsRemaining: credits,
        creditsTotal: credits,
        lockedPlanConfig,
        periodEnd,
      });
    }

    // Issue JWT cookie and redirect
    const token = signToken({ userId: user.id, email: user.email, role: user.role, plan: user.plan });
    setAuthCookie(res, token);
    return res.redirect("/");
  } catch (err) {
    console.error("[Google OAuth] Unexpected error:", err);
    return res.redirect("/login?google_error=server_error");
  }
});

export default router;
