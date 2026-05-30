// lib/services/radios.ts

export interface Radio {
  slug: string;
  name: string;
  countryCode?: string;
  market?: string;
  genre?: string;
  // add anything else you want to expose
}

export interface ListRadiosParams {
  offset?: number;
  limit?: number;
  countryCode?: string;
  search?: string;
}

export interface ListRadiosResult {
  items: Radio[];
  offset: number;
  total: number;
}

/**
 * This is your proprietary data access.
 * Right now it's stubbed with static data; replace with Prisma, Supabase, etc.
 */
export async function listRadios(params: ListRadiosParams = {}): Promise<ListRadiosResult> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 25;

  // TODO: replace with real DB query
  const allRadios: Radio[] = [
    {
      slug: 'nov8te-test-radio-1',
      name: 'NOV8TE Global Radio 1',
      countryCode: 'US',
      market: 'Global',
      genre: 'Pop',
    },
    {
      slug: 'nov8te-test-radio-2',
      name: 'NOV8TE Indie Radio',
      countryCode: 'US',
      market: 'US',
      genre: 'Indie',
    },
  ];

  // basic filtering example
  const filtered = allRadios.filter((radio) => {
    if (params.countryCode && radio.countryCode !== params.countryCode) return false;
    if (params.search && !radio.name.toLowerCase().includes(params.search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const slice = filtered.slice(offset, offset + limit);

  return {
    items: slice,
    offset,
    total: filtered.length,
  };
}
