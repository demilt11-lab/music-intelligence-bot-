import PlaylistsClient from './PlaylistsClient'
import { PageShell } from '@/components/ui/PageShell'

export const metadata = {
  title: 'Playlists',
  description: 'Explore playlists and their impact on your catalog.',
}

export default function PlaylistsPage() {
  return (
    <PageShell
      title="Playlist Intelligence"
      description="Explore playlist ecosystems, curator signals, and the impact of playlist placement across your music intelligence workflow."
    >
      <PlaylistsClient />
    </PageShell>
  )
}
