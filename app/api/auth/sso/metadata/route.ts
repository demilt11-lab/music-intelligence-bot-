// app/api/auth/sso/metadata/route.ts
//
// SAML Service-Provider metadata. This URL is our SP entityID; IdP admins point
// their "SP metadata" / entityID + ACS settings at it when configuring a
// connection. Assertions are consumed at /api/auth/sso/callback/saml.
import { NextResponse } from 'next/server';
import { spEntityId, samlCallbackUrl } from '@/lib/auth/sso/connection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const entityId = spEntityId();
  const acs = samlCallbackUrl();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService index="0" isDefault="true"
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acs}"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/samlmetadata+xml' },
  });
}
