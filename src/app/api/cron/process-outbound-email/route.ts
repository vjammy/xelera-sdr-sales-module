import { NextRequest, NextResponse } from "next/server";
import { processOutboundEmailQueue } from "@/lib/outbound";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    processed: await processOutboundEmailQueue({}),
  });
}
