# Account Self-Delete — 3-Tier Confirmation Flow

## Overview

Users can delete their own account from **Configuración → Zona de peligro**.
The confirmation method adapts automatically to the user's security setup:

| Tier | Condition | Confirmation required |
|------|-----------|----------------------|
| 1 | `totpEnabled = true` | 6-digit TOTP code (Google Authenticator) |
| 2 | `passwordHash != null` (no 2FA) | Current password |
| 3 | OAuth-only (no password, no 2FA) | 6-digit OTP sent to their registered email |

The account is **soft-deleted** (moves to admin trash). Auto-purge after **30 days**.

---

## Database Columns (users table)

```sql
delete_otp_hash    TEXT        -- sha256 hex of the 6-digit OTP (tier 3 only)
delete_otp_expiry  TIMESTAMP   -- OTP expires 10 minutes after send
```

Applied via startup migration in `artifacts/api-server/src/index.ts`.

Also reflected in Drizzle schema: `lib/db/src/schema/users.ts`
- `deleteOtpHash: text("delete_otp_hash")`
- `deleteOtpExpiry: timestamp("delete_otp_expiry")`

---

## Backend Endpoints

### `GET /api/user/delete-account/method`

Requires auth. Returns which confirmation method the authenticated user must use.

```json
{ "method": "totp" | "password" | "email" }
```

### `POST /api/user/delete-account/send-code`

Requires auth. Only valid for OAuth-only users (method = "email").

- Rate-limited: **1 request per 60 seconds** per user
- Generates a 6-digit OTP
- Stores `sha256(otp)` + expiry (10 min) in DB
- Sends email via SMTP (primary) → Resend (fallback)

Response:
```json
{ "success": true, "sentTo": "ab***@gmail.com" }
```

### `POST /api/user/delete-account`

Requires auth. Body: `{ "code": "<string>" }` — unified field for all tiers.

Validation flow:
1. If `totpEnabled`: verify via `verifySync` from `otplib` (window=2)
2. Else if `passwordHash`: verify via `comparePassword` (bcrypt)
3. Else: compare `sha256(code)` against `deleteOtpHash`, check expiry, then clear OTP fields

On success: sets `deletedAt = NOW()`, `isActive = "false"`, invalidates active cache.

---

## Frontend (settings.tsx)

Located in `artifacts/social-dashboard/src/pages/settings.tsx` inside the **Settings** component.

### State added
```tsx
const [deleteMethod, setDeleteMethod] = useState<"totp" | "password" | "email" | null>(null);
const [deleteMethodLoading, setDeleteMethodLoading] = useState(false);
const [deleteConfirmValue, setDeleteConfirmValue] = useState(""); // unified code field
const [codeSent, setCodeSent] = useState(false);
const [codeSentTo, setCodeSentTo] = useState("");
const [codeResendCooldown, setCodeResendCooldown] = useState(0);
const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

### Dialog behavior
- Opening the dialog calls `loadDeleteMethod()` → fetches method → if "email", auto-calls `handleSendDeleteCode()`
- TOTP: numeric input, `font-mono tracking-widest` styling, placeholder "000000"
- Password: password input
- Email OTP: shows sent confirmation + resend button with 60s countdown
- Confirm button is disabled until `deleteMethod` is resolved, OTP is sent (for email tier), and `deleteConfirmValue` is non-empty

### Email OTP resend
- `startResendCooldown()` sets `codeResendCooldown = 60` and decrements each second via `setInterval`
- Timer is cleared on dialog close

---

## Security Notes

- OTP is generated via `crypto.randomInt(0, 1_000_000)` (CSPRNG, zero-padded to 6 digits)
- Tier 3 OTP is sha256-hashed in DB (not plaintext, not bcrypt — sha256 is appropriate for short-lived random codes)
- OTP is invalidated immediately after successful use
- If email delivery fails (502), OTP hash is rolled back from DB and rate limit is cleared so the user can retry
- Rate limit (60s) prevents brute-force on 6-digit space
- Admin users get 400 "El administrador no puede eliminar su propia cuenta"
- `POST /delete-account/send-code` returns 502 on email failure (fail-hard, never false success)

---

## Files Modified

- `lib/db/src/schema/users.ts` — added `deleteOtpHash`, `deleteOtpExpiry` columns
- `artifacts/api-server/src/index.ts` — startup migration for the new columns
- `artifacts/api-server/src/routes/user.ts` — 3 new/updated endpoints + `sendDeleteOtpEmail` helper
- `artifacts/social-dashboard/src/pages/settings.tsx` — adaptive 3-tier dialog
