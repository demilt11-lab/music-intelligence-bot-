/**
 * GET /api/playlists/platforms
 *
 * Returns the list of all supported playlist platforms.
 */

import { NextResponse } from 'next/server';
import { PLAYLIST_PLATFORMS } from '@/lib/playlists/list/types';
import { handleApiError } from '@/lib/shared/errors';

/**
 * Returns the ordered array of supported playlist platforms.
 *
 * @returns `{ obj: PlaylistPlatform[] }`
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ obj: PLAYLIST_PLATFORMS });
  } catch (err) {
    return handleApiError(err);
  }
}
