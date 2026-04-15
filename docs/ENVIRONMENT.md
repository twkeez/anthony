# Environment variables

Single reference for what powers Anthony (AgencyPulse). Copy `.env.local.example` to `.env.local` and fill values. Never commit `.env.local`.

## Required env matrix

| Variable | Area | Required | Purpose |
|----------|------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | **Yes** | Project URL for browser + server. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | **Yes** | Public key for RLS-scoped reads used by server components. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | **Yes** | Server-only; API routes and sync scripts bypass RLS. |
| `NEXT_PUBLIC_APP_URL` | App | **Yes** (prod) | Canonical origin for OAuth redirects and absolute links. |
| `GOOGLE_CLIENT_ID` | Google OAuth | **Yes** (metrics) | OAuth client for agency Google (Ads / GA4 / GSC tokens). |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | **Yes** (metrics) | OAuth client secret. |
| `GOOGLE_GEMINI_API_KEY` | Gemini | **Yes** (AI features) | Report rewrite, strategy recommendation, client insight flows. |

## Google Ads / metrics sync

| Variable | Required | Notes |
|----------|----------|-------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | For Ads metrics | From Google Ads API Center. |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional | MCC / manager id (`login-customer-id` header). |
| `GOOGLE_PAGESPEED_API_KEY` | Optional | Lighthouse / PageSpeed category scores on sync. |

## Basecamp & communication

| Variable | Required | Notes |
|----------|----------|-------|
| `BASECAMP_ACCOUNT_ID` | Recommended | Numeric account id from `basecamp.com/XXXX/…`. |
| `BASECAMP_USER_EMAIL` + `BASECAMP_PASSWORD` | One auth path | Basic auth for Basecamp 2 API. |
| `BASECAMP_ACCESS_TOKEN` | Alternative to password | Bearer token when set. |
| `AGENCY_TEAM_NAMES` / `AGENCY_TEAM_IDS` | Fallback | When staff table cannot classify message-board authors. |

## Dashboard gate (recommended in production)

When **both** are set, `/`, `/dashboard/*`, and `/api/*` (except login/logout and Google OAuth callback) require an HttpOnly session cookie from `POST /api/auth/login`.

| Variable | Notes |
|----------|-------|
| `DASHBOARD_PASSWORD` | Shared workspace password. |
| `DASHBOARD_SESSION_SECRET` | Min **16** characters; signs the session cookie (HMAC-SHA256). |

## Automation (optional)

| Variable | Notes |
|----------|-------|
| `SYNC_CRON_SECRET` | If set, `POST /api/sync` accepts `Authorization: Bearer <secret>` without a dashboard cookie (Vercel Cron / worker). |

## Gemini debugging (optional)

| Variable | Notes |
|----------|-------|
| `GEMINI_DEBUG_LOGS` | Set to `1` to log model id and a short SHA-256 prefix of prompts (not raw text). |
| `GEMINI_MODEL` | Optional override for report AI rewrite (see `.env.local.example`). |

## Google Business Profile (optional)

| Variable | Notes |
|----------|-------|
| GBP sync | Uses the same Google OAuth tokens as other Google APIs. |
| Account / location | `clients.gbp_location_id` per client (`locations/{id}`). No separate global GBP account env is strictly required when ids are stored per row. |

## Supabase generated types (medium-term hygiene)

With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project:

```bash
npm run gen:types
```

Writes `types/database.gen.ts` (gitignored if you prefer) — compare against `types/database.types.ts` and merge manually until you fully switch over.
