// lib/scouting/workflows.ts
//
// Per-user scouting workflows + directive used by the home-page panel.
// Scoped by (tenantId, userId) so each user's customizations are private.
import { db } from '@/lib/db'

export type WorkflowInput = { label: string; href?: string | null }

export type ScoutingState = {
  workflows: { id: number; label: string; href: string | null; position: number }[]
  directive: string | null
  /** True once the user has saved anything — lets the client fall back to
   *  defaults only on a genuinely untouched account. */
  initialized: boolean
}

const MAX_WORKFLOWS = 50

export async function getScouting(
  tenantId: number,
  userId: number,
): Promise<ScoutingState> {
  const [workflows, directive] = await Promise.all([
    db.scoutingWorkflow.findMany({
      where: { tenantId, userId },
      orderBy: { position: 'asc' },
      select: { id: true, label: true, href: true, position: true },
    }),
    db.scoutDirective.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { text: true },
    }),
  ])

  return {
    workflows,
    directive: directive?.text ?? null,
    initialized: workflows.length > 0 || directive != null,
  }
}

export async function saveScouting(
  tenantId: number,
  userId: number,
  workflows: WorkflowInput[],
  directive: string,
): Promise<ScoutingState> {
  const clean = workflows
    .map((w) => ({
      label: String(w?.label ?? '').trim(),
      href: w?.href ? String(w.href).trim() : null,
    }))
    .filter((w) => w.label.length > 0)
    .slice(0, MAX_WORKFLOWS)

  // Replace-all semantics: the client manages the whole array, so we mirror it.
  await db.$transaction([
    db.scoutingWorkflow.deleteMany({ where: { tenantId, userId } }),
    ...(clean.length
      ? [
          db.scoutingWorkflow.createMany({
            data: clean.map((w, i) => ({
              tenantId,
              userId,
              label: w.label,
              href: w.href,
              position: i,
            })),
          }),
        ]
      : []),
    db.scoutDirective.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      update: { text: directive },
      create: { tenantId, userId, text: directive },
    }),
  ])

  return getScouting(tenantId, userId)
}
