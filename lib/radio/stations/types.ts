/**
 * Types for the Radio Stations module.
 */

/** A single radio station record with social metadata. */
export interface RadioStation {
  id: number;
  name: string;
  genre: string | null;
  frequency: string | null;
  market: string | null;
  broadcastArea: string | null;
  country: string | null;
  stationState: string | null;
  imageUrl: string | null;
  aqh: number | null;
  platform: string | null;
  /** Serialized as a string to avoid JS precision loss on large counts. */
  facebookFollowers: string | null;
  /** Serialized as a string to avoid JS precision loss on large counts. */
  facebookLikes: string | null;
  /** Serialized as a string to avoid JS precision loss on large counts. */
  instagramFollowers: string | null;
  /** Serialized as a string to avoid JS precision loss on large counts. */
  twitterFollowers: string | null;
  /** Serialized as a string to avoid JS precision loss on large counts. */
  wikipediaViews: string | null;
}

/** API response envelope for radio stations. */
export interface RadioStationsResponse {
  obj: RadioStation[];
}

/** Validated parameters for the radio stations query. */
export interface RadioStationsParams {
  /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
  code2: string;
}
