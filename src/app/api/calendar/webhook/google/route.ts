import { after, NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import { processGoogleWebhook } from '@/lib/calendar/googleImport';

// Google Calendar push notification receiver.
// Google sends POST with X-Goog-Channel-Id and X-Goog-Resource-State headers.
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id');
  const resourceState = req.headers.get('x-goog-resource-state');
  const resourceId = req.headers.get('x-goog-resource-id');

  if (!channelId || resourceState === 'sync') {
    return new NextResponse(null, { status: 200 });
  }

  if (resourceState === 'exists' || resourceState === 'updated' || resourceState === 'deleted') {
    after(async () => {
      try {
        const supabase = createAdminSupabase();
        await processGoogleWebhook(supabase, channelId);
      } catch (err) {
        console.error('[google-webhook] processGoogleWebhook failed', { channelId, resourceId, err });
      }
    });
  }

  return new NextResponse(null, { status: 200 });
}
