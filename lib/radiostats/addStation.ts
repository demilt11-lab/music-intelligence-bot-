// lib/radiostats/addStation.ts

import { radiostatsPost } from './client';

export type AddStationRequest = {
  country_code: string; // 2-letter: 'US', 'UK', etc.
  name: string;         // station name, e.g. 'BBC Radio 1'
  radio_type: 'radio' | 'digital' | 'sat_radio' | 'tv';
  website: string;
  city_name?: string;
  comment?: string;
  contact?: string;
  frequency?: string;
  stream_url?: string;
};

export type AddStationResponse = {
  result: string;  // e.g. 'success'
  message: string; // explanatory message from Radiostats
};

export async function addRadiostatsStation(
  station: AddStationRequest,
): Promise<AddStationResponse> {
  return radiostatsPost<AddStationResponse>(
    '/stations/station_request',
    station,
  );
}
