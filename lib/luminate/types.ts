// lib/luminate/types.ts

export type LuminateMetricValuePoint = {
  date: string;
  value: number | string;
};

export type LuminateDimensionCategory = {
  name: string;
  value: number | string | LuminateMetricValuePoint[];
};

export type LuminateMetricNode = {
  name: string;
  // value can be:
  // - number | string (aggregate)
  // - LuminateMetricValuePoint[] (time series)
  // - LuminateDimensionCategory[] (dimension categories)
  value: any;
};

export type LuminateMetricsResponse = {
  metrics: LuminateMetricNode[];
};

// Normalized internal shapes

export type StreamRecord = {
  entityType: 'song' | 'artist' | 'release_group';
  entityId: number;
  date: string;
  locationId: string | null;
  marketId: number | null;
  contentType: 'audio' | 'video' | null;
  commercialModel: 'premium' | 'ad_supported' | null;
  serviceType: 'on_demand' | 'programmed' | null;
  streams: string; // store as string to match repo conventions
};

export type SalesRecord = {
  entityType: 'song' | 'artist' | 'release_group';
  entityId: number;
  date: string;
  locationId: string | null;
  marketId: number | null;
  distributionChannel: 'digital' | 'physical' | null;
  purchaseMethod: 'online' | 'storefront' | null;
  storeStrata:
    | 'e-commerce'
    | 'mass_market'
    | 'independent'
    | 'direct_to_consumer'
    | 'venue'
    | 'non-traditional'
    | null;
  productFormat:
    | 'cd'
    | 'cassette'
    | 'vinyl'
    | 'mxcd'
    | 'digital'
    | 'dvd'
    | 'vhs'
    | 'laser'
    | 'unknown'
    | null;
  releaseType: 'album' | 'single' | 'ep' | 'video' | 'playlist' | 'unknown' | null;
  units: string;
};

export type AirplayRecord = {
  entityType: 'song' | 'artist' | 'release_group';
  entityId: number;
  date: string;
  locationId: string | null;
  marketId: number | null;
  formatId: string | null; // CW, AC, etc.
  audience: string | null;
  spins: string | null;
};
