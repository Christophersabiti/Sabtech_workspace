import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processGoogleWebhook } from '@/lib/calendar/googleImport';

// Google Calendar push notification receiver.
// Google sends POST with X-Goog-Channel-Id and X-Goog-Resource-State headers.
// We must respond 200 immediately, then process asynchronously.
export async function POST(req: NextRequest) {
  const channelId     = req.headers.get('x-goog-channel-id');
  const resourceState = req.headers.get('x-goog-resource-state');
  const resourceId    = req.headers.get('x-goog-resource-id');

  // 'sync' is a handshake ping when the watch is first created — acknowledge only
  if (!channelId || resourceState === 'sync') {
    return new NextResponse(null, { status: 200 });
  }

  // Process asynchronously so we respond to Google within 30s limit
  if (resourceState === 'exists' || resourceState === 'updated' || resourceState === 'deleted') {
    const supabase = await createClient();
    // Fire and forget — do not await
    processGoogleWebhook(supabase, channelId).catch((err) =>
      console.error('[google-webhook] processGoogleWebhook failed', { channelId, resourceId, err }),
    );
  }

  return new NextResponse(null, { status: 200 });
}
