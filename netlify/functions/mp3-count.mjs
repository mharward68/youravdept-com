// MP4 to MP3 Converter: anonymous usage tally.   POST /api/mp3-converter/count?e=visit|install|convert
// Each call writes one tiny record named "<event>/<YYYY-MM-DD>/<random id>". Nothing about the
// visitor or their files is stored. One record per event (no shared counter), so simultaneous
// calls can never overwrite each other. Test deploys write to a separate "-test" store.
import { getStore } from '@netlify/blobs';

const EVENTS = new Set(['visit', 'install', 'convert']);
export const storeNameFor = (deployContext) => (deployContext === 'production' ? 'mp3-usage' : 'mp3-usage-test');

export default async (req, context) => {
  const event = new URL(req.url).searchParams.get('e') ?? '';
  if (!EVENTS.has(event)) return new Response(null, { status: 400 });
  try {
    const day = new Date().toISOString().slice(0, 10);
    await getStore(storeNameFor(context?.deploy?.context)).set(`${event}/${day}/${crypto.randomUUID()}`, '1');
  } catch (err) {
    console.error('mp3-count: store failed', err?.message);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

export const config = {
  path: '/api/mp3-converter/count',
  method: ['POST'],
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 60 }
};
