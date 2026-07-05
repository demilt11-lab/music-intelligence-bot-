# Security Review & Penetration Test Status

**Product:** Music Intelligence API / A&R platform
**Review type:** Internal application security review (white-box, code + config)
**Last reviewed:** 2026-07-05
**Reviewer:** Engineering (self-assessment) — external test status in §7
**Scope:** First-party web UI, `/api/v1` (API-key) surface, `/api/internal`
management plane, `/api/scim` provisioning, SSO callbacks, ETL/cron jobs.

This document records the security posture with evidence, so the review is a
tracked artifact rather than an anecdote. It is the checklist's required
"security and permissions" evidence.

---

## 1. Summary

| Domain | Status | Notes |
|---|---|---|
| Authentication | 🟢 | scrypt passwords, HMAC sessions w/ server-side revocation, SSO |
| Authorization / RBAC | 🟢 | Scope + role checks; internal secret for management plane |
| Multi-tenant isolation | 🟢 | Enforced scoping helper + unit + live cross-tenant tests |
| Secrets handling | 🟢 | Hashed at rest (keys/sessions/SCIM tokens); write-only IdP secrets |
| Injection (SQLi/XSS) | 🟢 | Parameterized queries; nonce CSP; React escaping |
| Transport / headers | 🟢 | HSTS-capable host, strict CSP, no wildcard CORS |
| Rate limiting / abuse | 🟡 | Login + API limiter (Upstash or in-memory); not on every route |
| Dependency hygiene | 🟢 | `npm audit` clean (0 vulns) as of 2026-07-04 |
| Logging / audit | 🟡 | Request logs + job runs; no third-party SIEM/APM yet |
| External pen test | 🟡 | Internal review complete; external test scheduled (§7) |

No **critical** or **high** findings are open. Residual items are tracked in §6.

---

## 2. Threat model (STRIDE, abridged)

Primary assets: customer-owned data (watchlists, alerts, feedback, catalog
matches, users) and the shared market-intelligence corpus. Primary adversaries:
(a) a malicious or compromised tenant trying to reach another tenant's data,
(b) an unauthenticated attacker, (c) a stolen credential.

| Threat | Control |
|---|---|
| **S**poofing | scrypt password verify (constant-time); HMAC session tokens; OIDC id_token signature + `nonce`; SAML assertion signature |
| **T**ampering | Signed session + SSO `state` tokens; parameterized SQL; CSP |
| **R**epudiation | `request_logs` (per-tenant, per-endpoint), `job_runs`, SCIM `lastUsedAt` |
| **I**nfo disclosure | Tenant-scoped queries; secrets hashed/redacted; 404 (not 403) on foreign rows |
| **D**enial of service | Per-IP login limiter; per-key API limiter; recompute-from-source ETL |
| **E**levation | Role rank checks (`requireRole`); scope checks (`requireScope`); internal secret gate |

---

## 3. Authentication

- **Passwords**: Node `scrypt` (N=16384, r=8, p=1, 64-byte key), per-user random
  salt, parameters embedded for future hardening; verify is `timingSafeEqual`.
  Evidence: `lib/auth/password.ts`, `tests/unit/auth.test.ts`.
- **Sessions**: token = `id.exp.HMAC(AUTH_SECRET, id.exp)`. The edge middleware
  verifies HMAC+expiry cheaply; API routes re-check the `sessions` row so
  individual sessions are **revocable**. Only a SHA-256 of the token is stored.
  **Fails closed** in production without `AUTH_SECRET`. Evidence:
  `lib/auth/session.ts`, `proxy.ts`.
- **SSO**: OIDC (auth-code + PKCE, JWKS-verified id_token) and SAML (signed
  assertion via `@node-saml/node-saml`); JIT provisioning; refuses deactivated
  users. Evidence: `lib/auth/sso/*`, `docs/ENTERPRISE_IDENTITY.md`,
  `tests/unit/sso-*.test.ts`.
- **API keys**: `mi_`-prefixed, stored as SHA-256 only, revocable + expiring.
  Evidence: `lib/platform/auth.ts`.

## 4. Authorization & tenant isolation

- **RBAC**: `requireRole` (VIEWER<ANALYST<ADMIN) for UI; `requireScope` for the
  `/api/v1` key surface; `/api/internal/*` gated by a constant-time
  `INTERNAL_ADMIN_SECRET` bearer check (fails closed).
- **Tenant isolation**: every tenant-owned query is built through
  `tenantScopedWhere` (`lib/platform/tenant-scope.ts`), which validates the
  tenant (fails closed), forces the scoped id to win, and **rejects a mismatched
  caller-supplied `tenantId` (403)**. Cross-tenant reads/writes return **404**,
  not 403, so existence does not leak.
  Evidence: `tests/unit/tenant-scope.test.ts` (16 cases) + live cross-tenant
  API/SCIM tests in `scripts/smoke.ts` (alert rules and SCIM users).

## 5. Data & transport security

- **Secrets at rest**: password hashes, session hashes, API-key hashes, SCIM
  token hashes. IdP client secrets / certs are **write-only** via the admin API
  (`GET` returns only `*Set` booleans).
- **Injection**: 25 raw-SQL call sites audited — all positional-bind
  parameterized or allowlisted identifiers, never string-concatenated user
  input (see `DEPLOYMENT.md §12`). React output escaping + a **nonce-based CSP**
  (`proxy.ts`) with `frame-ancestors 'none'` mitigate XSS/clickjacking.
- **CORS**: explicit allowlist (`ALLOWED_ORIGIN`), never a wildcard; preflight
  handled in the middleware.
- **CSRF**: SameSite=Lax cookies + same-origin `Origin` assertion on mutating
  first-party endpoints (`assertSameOrigin`); the SAML ACS is exempt by design
  (cross-site POST) and instead relies on the signed assertion + signed
  RelayState.
- **Retention**: `jobs/etl/data_retention.ts` purges request logs (30d),
  expired sessions (7d), job runs (90d) — GDPR/CCPA minimization.

## 6. Residual risks (tracked, not open criticals)

| Item | Severity | Plan |
|---|---|---|
| Rate limiting not on every route (login + v1 covered) | Low | Extend keyed limiter to remaining mutating UI routes |
| No third-party SIEM/APM (Vercel dashboards only) | Low | Wire Sentry/DSN when the vendor account exists (`DEPLOYMENT.md §12`) |
| SAML browser-pin cookie is best-effort (SameSite on cross-site POST) | Low | Accepted: signed assertion + signed, TTL-bound RelayState are primary controls |
| Branch protection on `main` unverified | Low | Repo admin to require `ci.yml` checks |

## 7. Penetration test status

- **Internal white-box review**: complete (this document, 2026-07-05). Method:
  code + config audit against the STRIDE model above, plus the automated
  security regression tests listed in §3–§4.
- **Automated checks in CI**: typecheck, lint, unit tests (incl. auth/tenant/SSO
  security invariants), and a live smoke suite that asserts unauthenticated 401s,
  cross-tenant 404 isolation, and SCIM deprovisioning.
- **Dependency scanning**: `npm audit` clean (0 vulnerabilities), 2026-07-04.
- **External third-party penetration test**: **scheduled** as a pre-GA gate
  prior to the first enterprise multi-team rollout. Scope to cover the authn/SSO
  flows, tenant isolation, the SCIM surface, and the `/api/v1` key surface.
  Owner: Security. Findings and remediation will be appended to §6 on completion.

## 8. Reporting a vulnerability

Email `security@` (see repo/company contact) with details and a PoC. We
acknowledge within 3 business days. Do not open public issues for security
reports.
