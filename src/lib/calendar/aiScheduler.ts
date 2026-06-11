// AI Scheduling Assistant — uses Claude API to suggest optimal meeting times.
// Reads busy blocks + working hours, sends to Claude, returns human-readable suggestions.

import type { TimeSlot } from './availabilityService';

type ScheduleContext = {
  meetingTitle:   string;
  durationMinutes: number;
  attendeeNames:  string[];
  preferredWeek:  string;             // ISO week start date (Monday)
  timezone:       string;
  suggestedSlots: TimeSlot[];          // pre-computed free slots from availabilityService
  busySummary:    string;              // human-readable busy overview
};

/**
 * Call Claude to produce a scheduling recommendation with rationale.
 * Returns a markdown string with the suggestion.
 */
export async function getAiSchedulingSuggestion(
  ctx: ScheduleContext,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackSuggestion(ctx);
  }

  const slotsText = ctx.suggestedSlots
    .map((s, i) => {
      const start = new Date(s.start).toLocaleString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: ctx.timezone,
      });
      const end = new Date(s.end).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: ctx.timezone,
      });
      return `Option ${i + 1}: ${start} – ${end} (${ctx.timezone})`;
    })
    .join('\n');

  const prompt = `You are a scheduling assistant for Sabtech Workspace, a project management and consulting platform.

Meeting: "${ctx.meetingTitle}"
Duration: ${ctx.durationMinutes} minutes
Attendees: ${ctx.attendeeNames.join(', ')}
Preferred week: ${ctx.preferredWeek}
Timezone: ${ctx.timezone}

Available time slots (already filtered against everyone's calendars and working hours):
${slotsText || 'No common free slots found in this period.'}

Busy context: ${ctx.busySummary}

Recommend the best 1–3 slots for this meeting with a brief explanation for each choice. Consider:
- Morning slots for focus-heavy meetings (kickoffs, reviews, strategy)
- Afternoon for check-ins and client calls
- Avoid Monday morning and Friday afternoon when possible
- Mention if no slots are available and suggest expanding the search window

Reply in markdown with the slot(s) bolded.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    return data.content.find((b) => b.type === 'text')?.text ?? fallbackSuggestion(ctx);
  } catch {
    return fallbackSuggestion(ctx);
  }
}

function fallbackSuggestion(ctx: ScheduleContext): string {
  if (!ctx.suggestedSlots.length) {
    return `No common free slots found for **"${ctx.meetingTitle}"** in the selected week. Try expanding the search window or reducing the meeting duration.`;
  }
  const first = ctx.suggestedSlots[0];
  const start = new Date(first.start).toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ctx.timezone,
  });
  return `**Suggested:** ${start} (${ctx.timezone}) — first available slot matching all attendees' schedules.`;
}
