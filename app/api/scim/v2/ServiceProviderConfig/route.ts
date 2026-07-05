// app/api/scim/v2/ServiceProviderConfig/route.ts
//
// SCIM 2.0 discovery document (RFC 7643 §5). IdPs read this to learn which
// capabilities we support. Declares what this implementation actually does:
// PATCH yes, bulk/filter/sort as configured, bearer auth.
import { scimJson } from '@/lib/auth/scim/respond';
import { spBaseUrl } from '@/lib/auth/sso/connection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return scimJson({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: `${spBaseUrl()}/docs/ENTERPRISE_IDENTITY.md`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Per-tenant SCIM bearer token (Authorization: Bearer <token>)',
        primary: true,
      },
    ],
    meta: { resourceType: 'ServiceProviderConfig', location: `${spBaseUrl()}/api/scim/v2/ServiceProviderConfig` },
  });
}
