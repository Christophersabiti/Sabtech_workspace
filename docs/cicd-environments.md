# CI/CD & Environments

## Branch → Environment Map

| Branch | Environment | Trigger | URL |
|--------|-------------|---------|-----|
| `feature/*`, `fix/*` | Dev (Vercel Preview) | PR open/push | Auto-generated Vercel preview URL |
| `develop` | Staging | Push to `develop` | `staging.yourdomain.com` |
| `main` | Production | Push to `main` (requires review) | `yourdomain.com` |

## Git Flow

```
feature/xyz  →  PR → develop  →  PR (reviewed) → main
                      ↓                            ↓
                   Staging                      Production
```

## GitHub Secrets Required

Set these in **Settings → Secrets and variables → Actions**:

### Vercel
| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Found in Vercel project settings |
| `VERCEL_PROJECT_ID` | Found in Vercel project settings |

### Staging environment
| Secret | Value |
|--------|-------|
| `NEXT_PUBLIC_CONVEX_URL_STAGING` | Staging Convex deployment URL |
| `NEXT_PUBLIC_SUPABASE_URL_STAGING` | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING` | Staging Supabase anon key |

### Production environment
| Secret | Value |
|--------|-------|
| `NEXT_PUBLIC_CONVEX_URL_PROD` | Production Convex deployment URL |
| `NEXT_PUBLIC_SUPABASE_URL_PROD` | Production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD` | Production Supabase anon key |

## GitHub Environment Protection Rules

Configure in **Settings → Environments**:

- **staging**: no restrictions (auto-deploys on push to `develop`)
- **production**: require 1 reviewer approval before deploy runs

## Vercel Setup

1. Connect the GitHub repo to Vercel once
2. Set `develop` branch as a "Preview" branch (not production)
3. Set `main` as the Production branch
4. In Vercel **Settings → Environment Variables**, scope variables per environment (Production / Preview / Development)

## Local Development

```bash
cp .env.local.example .env.local   # fill in dev Supabase + Convex values
npm run dev
```
