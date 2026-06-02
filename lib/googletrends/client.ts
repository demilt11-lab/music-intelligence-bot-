/**
 * Google Trends client using the `google-trends-api` npm package.
 *
 * No API key required — uses public Google Trends endpoints.
 *
 * Rate limit: Google Trends blocks fast/repeated requests; callers must
 * insert adequate delays between calls (2000ms recommended).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api') as {
  interestOverTime: (opts: GoogleTrendsOptions) => Promise<string>;
  relatedQueries: (opts: GoogleTrendsOptions) => Promise<string>;
  interestByRegion: (opts: GoogleTrendsOptions) => Promise<string>;
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface GoogleTrendsOptions {
  keyword: string | string[];
  startTime?: Date;
  endTime?: Date;
  geo?: string;
  category?: number;
  granularTimeResolution?: boolean;
}

interface TimelineData {
  time: string;
  value: number[];
  formattedAxisTime: string;
  formattedTime: string;
  formattedValue: string[];
  isPartial?: boolean;
}

interface RegionData {
  geoCode: string;
  geoName: string;
  value: number[];
  formattedValue: string[];
}

interface RelatedQueryItem {
  query: string;
  value: string; // e.g. "Breakout" or a percentage string
  formattedValue: string;
  hasData: boolean;
  link: string;
}

export interface TrendResult {
  query: string;
  averageInterest: number; // 0–100
  peakInterest: number;
  trend: 'rising' | 'stable' | 'declining';
  relatedQueries: string[];
  geoBreakdown: Record<string, number>; // country code -> interest score
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyTrend(values: number[]): 'rising' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';

  // Compare first-half average vs second-half average
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (avgFirst === 0 && avgSecond === 0) return 'stable';

  const delta = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 1;

  if (delta > 0.1) return 'rising';
  if (delta < -0.1) return 'declining';
  return 'stable';
}

// ─── Exported API functions ───────────────────────────────────────────────────

/**
 * Fetch interest-over-time for a keyword and return a structured TrendResult.
 *
 * @param keyword  Search term, e.g. `"Olivia Rodrigo good 4 u"`
 * @param geo      ISO country code ('US', 'GB', …) or '' for global. Defaults to ''.
 * @param days     Number of trailing days to look back. Defaults to 7.
 */
export async function getInterestOverTime(
  keyword: string,
  geo = '',
  days = 7,
): Promise<TrendResult> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 86_400_000);

  // ── Interest over time ───────────────────────────────────────────────────
  let timelineValues: number[] = [];

  try {
    const iotRaw = await googleTrends.interestOverTime({
      keyword,
      startTime,
      endTime,
      geo,
    });

    const iotJson = JSON.parse(iotRaw) as {
      default?: {
        timelineData?: TimelineData[];
      };
    };

    const timelineData = iotJson?.default?.timelineData ?? [];
    timelineValues = timelineData
      .filter((d) => !d.isPartial)
      .map((d) => (d.value?.[0] ?? 0));
  } catch {
    // Google Trends may return empty results for obscure queries — treat as 0
    timelineValues = [];
  }

  const averageInterest =
    timelineValues.length > 0
      ? Math.round(timelineValues.reduce((a, b) => a + b, 0) / timelineValues.length)
      : 0;

  const peakInterest =
    timelineValues.length > 0 ? Math.max(...timelineValues) : 0;

  const trend = classifyTrend(timelineValues);

  // ── Related queries ──────────────────────────────────────────────────────
  let relatedQueries: string[] = [];

  try {
    const rqRaw = await googleTrends.relatedQueries({
      keyword,
      startTime,
      endTime,
      geo,
    });

    const rqJson = JSON.parse(rqRaw) as {
      default?: {
        rankedList?: Array<{
          rankedKeyword?: RelatedQueryItem[];
        }>;
      };
    };

    // rankedList[0] = top queries, rankedList[1] = rising queries
    const allRanked = rqJson?.default?.rankedList ?? [];
    relatedQueries = allRanked
      .flatMap((list) => list.rankedKeyword ?? [])
      .map((item) => item.query)
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    relatedQueries = [];
  }

  // ── Geo breakdown ────────────────────────────────────────────────────────
  const geoBreakdown: Record<string, number> = {};

  try {
    const ibrRaw = await googleTrends.interestByRegion({
      keyword,
      startTime,
      endTime,
      geo,
    });

    const ibrJson = JSON.parse(ibrRaw) as {
      default?: {
        geoMapData?: RegionData[];
      };
    };

    const geoData = ibrJson?.default?.geoMapData ?? [];
    for (const region of geoData) {
      if (region.geoCode && region.value?.[0] != null) {
        geoBreakdown[region.geoCode] = region.value[0];
      }
    }
  } catch {
    // geo breakdown is best-effort
  }

  return {
    query: keyword,
    averageInterest,
    peakInterest,
    trend,
    relatedQueries,
    geoBreakdown,
  };
}

/**
 * Fetch the current rising search queries globally (or by category).
 *
 * @param category  Google Trends category ID string. '35' = Music.
 *                  Pass undefined for all categories.
 * @returns Array of rising query strings (up to ~25 entries).
 */
export async function getRisingQueries(category?: string): Promise<string[]> {
  // We use a broad music keyword to pull rising related queries in the music category.
  const anchorKeyword = 'music';
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 86_400_000);

  const opts: GoogleTrendsOptions = {
    keyword: anchorKeyword,
    startTime,
    endTime,
    geo: '',
    ...(category !== undefined ? { category: parseInt(category, 10) } : {}),
  };

  try {
    const rqRaw = await googleTrends.relatedQueries(opts);

    const rqJson = JSON.parse(rqRaw) as {
      default?: {
        rankedList?: Array<{
          rankedKeyword?: RelatedQueryItem[];
        }>;
      };
    };

    const rankedList = rqJson?.default?.rankedList ?? [];

    // rankedList[1] contains rising queries specifically
    const risingList = rankedList[1]?.rankedKeyword ?? rankedList[0]?.rankedKeyword ?? [];

    return risingList
      .filter((item) => item.hasData)
      .map((item) => item.query)
      .filter(Boolean);
  } catch {
    return [];
  }
}
