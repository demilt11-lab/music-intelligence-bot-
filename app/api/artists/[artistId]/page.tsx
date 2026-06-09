import { redirect } from 'next/navigation'

export default async function LegacyArtistPage({
  params,
}: {
  params: Promise<{ artistId: string }>
}) {
  const { artistId } = await params
  redirect(`/artists/${artistId}`)
}
