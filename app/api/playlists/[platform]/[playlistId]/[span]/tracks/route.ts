import { NextRequest, NextResponse } from 'next/server';
import { validatePlaylistTracksParams } from '@/lib/playlists/tracks/validate';
import { getPlaylistTracks } from '@/lib/playlists/tracks/service';
import { handleApiError } from '@/lib/shared/errors';

/**
 * GET /api/playlists/:platform/:playlistId/:span/tracks
 *
 * Returns current or historical track membership for a playlist.
 * span = "current" | "past"
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ platform: string; playlistId: string; span: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = validatePlaylistTracksParams(
      params.platform,
      params.playlistId,
      params.span,
      request.nextUrl.searchParams,
    );
    const result = await getPlaylistTracks(p);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
