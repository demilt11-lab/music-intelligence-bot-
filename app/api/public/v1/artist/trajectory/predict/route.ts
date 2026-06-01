import { NextRequest, NextResponse } from "next/server";

const INTERNAL_URL =
  "http://localhost:3000/api/v1/artist/trajectory/predict";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  // TODO: validate apiKey against your api_keys table

  const body = await req.json();

  const res = await fetch(INTERNAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return NextResponse.json(json, {
    status: res.status,
  });
}
