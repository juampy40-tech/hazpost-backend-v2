# Security Audit — ECO Social Manager API Server

_Last updated: 2026-04-07_

## Security hardening applied (Task #19)

### 1. HTTP Security Headers (helmet.js)
All API responses now include:
- `Content-Security-Policy` — restricts script/style/font/image sources
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (HSTS, 1 year)
- `Referrer-Policy: no-referrer`
- `Origin-Agent-Cluster`
- `Cross-Origin-Resource-Policy: same-origin`

### 2. Rate Limiting
- **Auth endpoints** (`/login`, `/register`): max 10 requests/minute per IP — blocks brute-force and credential stuffing.
- **AI generation endpoints** (`/posts/generate-bulk`, `/posts/generate-extra`, `/landings`, `/landings/:id/generate-hero`, `/landings/:id/regenerate`): max 20 requests/minute per authenticated user.

### 3. Endpoint Protection
- All `/api/social/*` routes verified to require JWT (`requireAuth` middleware at router level).
- Admin routes (`/api/user/admin/*`, `/api/settings`, `/api/analytics/sync-metrics`, `/api/analytics/refresh-audience`, `/api/analytics/audience-snapshot`) verified to require `role === "admin"` via `requireAdmin` middleware.
- `POST /api/niches/insights/run` — added `requireAdmin` guard (was auth-only before).

### 4. Tenant Isolation
- All data queries use `tenantFilter(req)` helpers that scope SQL WHERE conditions to `userId` for non-admin users.
- Admin role bypasses tenant filter (sees all data).
- Verified in: `posts.ts`, `niches.ts`, `backgrounds.ts`, `analytics.ts`, `landings.ts`, `reels.ts`, `social-accounts.ts`.

### 5. Error Handling
- Global Express error handler added in `app.ts` — sanitizes error messages in production.
- Stack traces only included in responses when `NODE_ENV !== "production"`.
- Password/token/secret strings stripped from error messages via regex before response.

### 6. Frontend Admin Protection
- `ProtectedRoute` component with `adminOnly` prop redirects non-admins to `/`.
- Admin page wrapped with `<ProtectedRoute adminOnly>` — prevents both visual access and navigation.
- Backend enforces admin check independently on every admin route handler.

### 7. JWT / Token Handling
- JWTs use `JWT_SECRET` / `TOKEN_ENCRYPTION_KEY` environment variable — never hardcoded.
- Tokens are stored as httpOnly cookies (not accessible to JavaScript).
- Request logger strips query params and never logs request bodies (no token/password leakage in logs).

---

## Dependency Audit Findings (`pnpm audit`)

### Production API dependencies — NO critical/high vulnerabilities affecting production
All high/critical findings are in dev-only or design artifacts:

| Severity | Package | Path | Status |
|----------|---------|------|--------|
| High | picomatch (ReDoS) | `mockup-sandbox > fast-glob > micromatch` | **Acceptable** — design artifact, dev-only |
| High | picomatch (ReDoS) | `mockup-sandbox > vite` | **Acceptable** — dev server only |
| High | path-to-regexp | `express > router > path-to-regexp` | **False positive** — express@5.2.1 bundles patched version internally |
| High | lodash (code injection) | `mockup-sandbox > recharts > lodash` | **Acceptable** — design artifact |
| High | vite (server.fs.deny bypass) | `mockup-sandbox > vite` | **Acceptable** — dev server only |
| High | vite (WebSocket arbitrary file read) | `mockup-sandbox > vite` | **Acceptable** — dev server only |
| Moderate | brace-expansion | dev tooling | **Acceptable** — dev only |
| Moderate | picomatch (method injection) | `mockup-sandbox` | **Acceptable** — dev only |
| Moderate | yaml | dev tooling | **Acceptable** — dev only |
| Low | @tootallnate/once | indirect | **Acceptable** — not in hot path |

**No vulnerabilities require immediate patching in the production API surface.**
