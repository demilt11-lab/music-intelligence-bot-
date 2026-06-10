import SearchClient from './SearchClient'

export default function SearchPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  return <SearchClient initialQuery={searchParams?.q ?? ''} />
}
