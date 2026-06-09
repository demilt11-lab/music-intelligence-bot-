import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''
const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  ''

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  const { artistId } = await params

  try {
    const res = await fetch(`${BASE_URL}/api/v1/artists/${artistId}`, {
      headers: {
        'x-api-key': API_KEY,
      },
      cache: 'no-store',
    })

    const text = await res.text()

    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch artist detail',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
