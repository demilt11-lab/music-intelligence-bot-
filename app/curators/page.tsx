import CuratorsClient from './CuratorsClient'
import { PageShell } from '@/components/ui/PageShell'

export const metadata = {
  title: 'Curators',
  description: 'Discover curators and their playlist ecosystems.',
}

export default function CuratorsPage() {
  return (
    <PageShell
      title="Curator Intelligence"
      description="Discover curators, map their playlist ecosystems, and identify the editorial relationships that matter across your A&R workflow."
    >
      <CuratorsClient />
    </PageShell>
  )
}
