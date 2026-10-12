// Just the Audio: private usage report.   GET /api/just-the-audio/stats?key=<JUST_THE_AUDIO_STATS_KEY>
// Totals plus the last 30 days (HTML), or ?format=json for the activity page. Answers 404 without the right key, so the page does not announce itself.
import { getStore } from '@netlify/blobs';
import { storeNameFor } from './just-the-audio-count.mjs';

const EVENTS = ['visit', 'install', 'convert'];

export default async (req, context) => {
  const expected = Netlify.env.get('JUST_THE_AUDIO_STATS_KEY');
  const given = new URL(req.url).searchParams.get('key');
  if (!expected || given !== expected) return new Response('Not found', { status: 404 });

  const store = getStore(storeNameFor(context?.deploy?.context));
  const totals = {};
  const byDay = {};
  for (const event of EVENTS) {
    const { blobs } = await store.list({ prefix: `${event}/` });
    totals[event] = blobs.length;
    for (const { key } of blobs) {
      const day = key.split('/')[1];
      (byDay[day] ??= {})[event] = (byDay[day][event] ?? 0) + 1;
    }
  }
  const days = Object.keys(byDay).sort().reverse().slice(0, 30);
  if (new URL(req.url).searchParams.get('format') === 'json') {
    // Used by the private activity page (/just-the-audio-activity). Every day with activity, newest first (the page works out WTD, MTD, YTD).
    const recent = Object.keys(byDay).sort().reverse()
      .map((day) => ({ day, visit: byDay[day].visit ?? 0, install: byDay[day].install ?? 0, convert: byDay[day].convert ?? 0 }));
    return new Response(JSON.stringify({ totals, days: recent, generatedAt: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
    });
  }
  const rows = days
    .map((d) => `<tr><td>${d}</td>${EVENTS.map((e) => `<td>${byDay[d][e] ?? 0}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Just the Audio usage</title>
<body style="font-family:system-ui,sans-serif;color:#152B4A;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Just the Audio usage</h1>
<p><strong>${totals.visit}</strong> page visits, <strong>${totals.install}</strong> installs, <strong>${totals.convert}</strong> files converted (all time).</p>
<table cellpadding="8" style="border-collapse:collapse;width:100%;text-align:left">
<tr style="border-bottom:2px solid #2AA4A2"><th>Day (ET)</th><th>Visits</th><th>Installs</th><th>Conversions</th></tr>${rows}
</table></body></html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
  });
};

export const config = { path: '/api/just-the-audio/stats', method: ['GET'] };
