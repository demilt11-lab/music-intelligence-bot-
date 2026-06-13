// app/api/internal/tenants/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';

export async function GET(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ obj: tenants }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null) as {
    name?: string;
    slug?: string;
  };

  if (!body?.name || !body?.slug) {
    return NextResponse.json(
      { error: 'name and slug are required' },
      { status: 400 },
    );
  }

  const tenant = await db.tenant.create({
    data: {
      name: body.name,
      slug: body.slug,
    },
  });

  return NextResponse.json({ obj: tenant }, { status: 201 });
}
