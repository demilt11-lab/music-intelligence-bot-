import SearchClient from './SearchClient'

export default async function SearchPage(
  props: {
    searchParams?: Promise<{ q?: string }>
  }
) {
  const searchParams = await props.searchParams;
  return <SearchClient initialQuery={searchParams?.q ?? ''} />
}
