// app/api/ui/scouting-workflows/route.ts
//
// First-party CRUD for the home-page scouting workflows + directive.
// GET returns the acting user's saved state; PUT replaces it wholesale.
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard'
import { getScouting, saveScouting, type WorkflowInput } from '@/lib/scouting/workflows'

export const dynamic = 'force-dynamic'

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error(`[ui/scouting-workflows] ${fallback}:`, err)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req)
    const data = await getScouting(user.tenantId, user.userId)
    return NextResponse.json({ obj: data })
  } catch (err) {
    return errorResponse(err, 'Failed to load scouting workflows')
  }
}

export async function PUT(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const user = await requireSession(req)

    const body = (await req.json().catch(() => ({}))) as {
      workflows?: unknown
      directive?: unknown
    }

    const workflows: WorkflowInput[] = Array.isArray(body.workflows)
      ? (body.workflows as WorkflowInput[])
      : []
    const directive = typeof body.directive === 'string' ? body.directive : ''

    const data = await saveScouting(user.tenantId, user.userId, workflows, directive)
    return NextResponse.json({ obj: data })
  } catch (err) {
    return errorResponse(err, 'Failed to save scouting workflows')
  }
}
