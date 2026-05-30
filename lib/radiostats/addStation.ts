// lib/radiostats/addStation.ts
import { radiostatsPost } from './client';

export type AddStationRequest = {
  country_code: string; // 2-letter, e.g., 'US'
  name: string;         // station name
  radio_type: 'radio' | 'digital' | 'sat_radio' | 'tv';
  website: string;
  city_name?: string;
  comment?: string;
  contact?: string;
  frequency?: string;
  stream_url?: string;
};

export type AddStationResponse = {
  result: string;  // e.g., 'success'
  message: string; // human message
};

export async function addRadiostatsStation(
  station: AddStationRequest,
): Promise<AddStationResponse> {
  return radiostatsPost<AddStationResponse>(
    '/stations/station_request',
    station,
  );
}
