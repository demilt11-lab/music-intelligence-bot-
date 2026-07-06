# Enterprise Identity: SSO (OIDC / SAML) & SCIM Provisioning

This platform supports enterprise single sign-on and directory-driven user
provisioning. Both are configured **per tenant** through the management-plane
API — there is no per-IdP env var to set on the app.

- **SSO**: OpenID Connect (OIDC) and SAML 2.0. Users authenticate at their own
  IdP; we JIT-provision the account and mint the same first-party session the
  password login uses.
- **SCIM 2.0**: the customer's IdP (Okta, Entra ID, etc.) pushes user
  create / update / deactivate to us over a bearer-authenticated REST API.

Login is **routed by email domain**: on the login page a user enters their work
email and clicks *Continue with SSO*; we look up the enabled connection whose
`emailDomain` matches and redirect them to the right IdP.

---

## 1. Architecture

```
Browser ──▶ /api/auth/sso/login?email=…      (resolve connection by domain)
        ◀── 302 to IdP (OIDC auth endpoint | SAML entryPoint)
IdP     ──▶ /api/auth/sso/callback/oidc  (code)     ── verify id_token (JWKS)
        or  /api/auth/sso/callback/saml  (SAMLResponse) ── verify signature
                     │
                     ▼   JIT provision TenantUser ──▶ createSession() ──▶ nv8_session cookie

IdP directory ──▶ /api/scim/v2/Users            (Bearer <scim token>)
                     create / list / PATCH active=false / DELETE
```

Key security properties:

- **Signed, TTL-bound `state`** carries the connection id, nonce, PKCE verifier
  and return path (`lib/auth/sso/state.ts`); it is HMAC-signed with `AUTH_SECRET`
  and also pinned to the browser via a short-lived httpOnly cookie.
- **OIDC** uses authorization-code + **PKCE (S256)** and verifies the id_token
  **signature against the IdP JWKS** plus `iss` / `aud` / `exp` / `nonce`
  (`lib/auth/sso/oidc.ts`). An unsigned or `alg:none` token is rejected.
- **SAML** signature / audience / condition / replay validation is delegated to
  `@node-saml/node-saml`; we require the **assertion to be signed**.
- **SCIM tokens** are stored only as SHA-256 hashes; the raw value is shown once.
- **Deprovisioning is immediate**: SCIM `active=false` (or DELETE) revokes the
  user's live sessions (`revokeAllUserSessions`).
- Every SCIM query and admin action is **tenant-scoped**; a tenant's token can
  never read or mutate another tenant's users (covered by `scripts/smoke.ts`).

---

## 2. Configure an OIDC connection

```bash
curl -X POST "$APP/api/internal/tenants/$TENANT_ID/sso" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "OIDC",
    "displayName": "Acme Okta",
    "emailDomain": "acme.com",
    "defaultRole": "ANALYST",
    "oidcIssuer": "https://acme.okta.com",
    "oidcClientId": "0oa1a2b3c4",
    "oidcClientSecret": "…",
    "oidcScopes": "openid email profile"
  }'
```

At the IdP, register an OIDC web app with redirect URI:

```
$APP/api/auth/sso/callback/oidc
```

The `oidcIssuer` must serve `/.well-known/openid-configuration`.

## 3. Configure a SAML connection

```bash
curl -X POST "$APP/api/internal/tenants/$TENANT_ID/sso" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "SAML",
    "displayName": "Acme Entra",
    "emailDomain": "acme.com",
    "defaultRole": "ANALYST",
    "samlEntryPoint": "https://login.microsoftonline.com/…/saml2",
    "samlIssuer": "https://sts.windows.net/…/",
    "samlCert": "MIID…(IdP signing cert, base64 body or PEM)…"
  }'
```

At the IdP, register a SAML app with:

| Setting                    | Value                                      |
|----------------------------|--------------------------------------------|
| SP entityID / metadata URL | `$APP/api/auth/sso/metadata`               |
| ACS (Reply) URL            | `$APP/api/auth/sso/callback/saml`          |
| NameID format              | email address                              |
| Sign assertion             | **required**                               |

Secrets and certs are **write-only**: `GET /api/internal/tenants/:id/sso`
returns `oidcClientSecretSet` / `samlCertSet` booleans, never the values.

## 4. SCIM provisioning

Mint a per-tenant token (returned once):

```bash
curl -X POST "$APP/api/internal/tenants/$TENANT_ID/scim-token" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_SECRET" \
  -d '{"label":"Okta production"}'
# → { "obj": { "id": 1, "token": "scim_…" } }
```

Point the IdP's SCIM integration at:

```
Base URL:  $APP/api/scim/v2
Token:     scim_…   (Authorization: Bearer)
```

Supported (RFC 7643/7644): `GET /Users` (filter `userName eq "…"`, pagination),
`POST /Users`, `GET/PUT/PATCH/DELETE /Users/{id}`, `GET /ServiceProviderConfig`.
Roles map from the SCIM `roles` attribute (`ADMIN` / `ANALYST` / `VIEWER`),
defaulting to least-privilege `VIEWER`. Group push is not implemented; assign
roles via the `roles` attribute or the admin API.

## 5. Interaction with password login

- SSO and password login coexist. A tenant can require SSO operationally by not
  issuing passwords; SSO/SCIM users have `passwordHash = null` and cannot use
  the password form.
- First SSO login for a SCIM-pre-provisioned user links them by email, then by
  the stable IdP subject (`externalId`) thereafter — an IdP email change does
  not orphan the account.
- A SCIM-deactivated user (`isActive = false`) cannot log in via SSO; the
  provisioning system is the source of truth.

## 6. Tests & evidence

- Unit: `tests/unit/sso-state.test.ts` (signed state, PKCE, TTL, browser pin),
  `tests/unit/sso-oidc.test.ts` (id_token signature / claim verification against
  a generated RSA key), `tests/unit/scim-user.test.ts` (SCIM wire format & PATCH
  shapes).
- End-to-end (`scripts/smoke.ts`, real Postgres in CI): SCIM create → filtered
  list → cross-tenant 404 → PATCH-deprovision, and SSO domain routing.
