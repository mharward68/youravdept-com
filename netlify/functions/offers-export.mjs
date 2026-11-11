// YAVD Offers Module: /api/offers/export   GET all offers as one JSON file
// Session 1.4. Signed-in only. A full backup, preview keys included, so keep
// the file private. Downloads as yavd-offers-<live|test>-YYYY-MM-DD-HHMM.json
//
// Session 3.7 (contract 1.3.0): the file also holds the pictures of the
// current offers, each once, as base64:
//   images:        [{ id, type, bytes, width, height, dataBase64 }]
//   imagesOmitted: ids that did not fit under EXPORT_MAX_BYTES (in a later part)
//   imagesMissing: ids a current offer refers to that could not be read
//   imagesNote:    plain sentence for the admin page ("" when nothing to say)
// Pictures that do not fit go in part 2: GET /api/offers/export?images=rest
// (yavd-offers-<live|test>-images-<stamp>.json). If even part 2 is full, it
// says so and names part 3 (?images=rest&part=3), and so on.
//
// Parts are worked out the same way on every request: pictures in the order
// the offers first refer to them, packed greedily by their stored size. So
// part 2 is exactly what part 1 left out, as long as no offer was saved in
// between (if one was, download both again).
//
// A picture that cannot be read never fails the export: the offers matter
// most, and the file says which pictures are missing.
import { CONTRACT_VERSION, ROUTES, TIME_ZONE } from '../../shared/offer-contract.js';
import { requireAdmin, json, NO_STORE } from './lib/offers-auth.mjs';
import { StoreError, loadOffers, offersStore, offersStoreName } from './lib/offers-store.mjs';
import { getImage, headImage, imagesStore, imagesStoreName, isImageId } from './lib/offer-images-store.mjs';

/** Largest file this route sends. A Netlify function response tops out near 6 MB. */
export const EXPORT_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
// Room each picture entry needs besides its base64 text (keys, numbers, id,
// indentation). Generous on purpose: the estimate must never fall short.
const ENTRY_OVERHEAD = 400;
const MAX_PART = 50;

function stamp(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

const base64Length = (n) => 4 * Math.ceil(n / 3);
const byteLength = (s) => Buffer.byteLength(s, 'utf8');
const toText = (file) => JSON.stringify(file, null, 2) + '\n';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const partUrl = (n) => `${ROUTES.apiExport}?images=rest${n > 2 ? `&part=${n}` : ''}`;

/** Picture ids the current offers refer to, first use first, each once. */
function referencedIds(offers) {
  const seen = new Set();
  for (const o of offers) {
    const id = o?.image?.id;
    if (isImageId(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * Splits the readable pictures into parts. Part 1 starts with `firstUsed`
 * bytes already taken (the offers); later parts start with `restUsed`.
 * Returns { parts: [[id...], ...], missing: [id...] }.
 */
async function planParts(store, ids, firstUsed, restUsed) {
  const missing = [];
  const sized = [];
  for (const id of ids) {
    let meta = null;
    try { meta = await headImage(store, id); } catch { meta = null; }
    if (meta) sized.push({ id, size: base64Length(meta.bytes) + ENTRY_OVERHEAD });
    else missing.push(id);
  }
  const parts = [[]];
  let used = firstUsed;
  for (const { id, size } of sized) {
    const current = parts[parts.length - 1];
    // A part always takes at least one picture, so packing always ends.
    if (used + size > EXPORT_MAX_BYTES && (current.length > 0 || parts.length > 1)) {
      parts.push([id]);
      used = restUsed + size;
    } else {
      current.push(id);
      used += size;
    }
  }
  return { parts, missing };
}

/** Reads the pictures of one part. Unreadable ones go to `missing`. */
async function readPart(store, ids, missing) {
  const images = [];
  for (const id of ids) {
    let got = null;
    try { got = await getImage(store, id); } catch { got = null; }
    if (!got) { missing.push(id); continue; }
    const { meta, bytes } = got;
    images.push({ id, type: meta.type, bytes: meta.bytes, width: meta.width, height: meta.height,
      dataBase64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64') });
  }
  return images;
}

function note(part, parts, missing) {
  const out = [];
  if (part < parts) {
    out.push(`Some pictures did not fit in this file. Download part ${part + 1} as well to keep every picture.`);
  }
  if (missing.length) {
    out.push(`${plural(missing.length, 'picture', 'pictures')} could not be read and ${missing.length === 1 ? 'is' : 'are'} not in this file.`);
  }
  return out.join(' ');
}

function respond(file, name) {
  const text = toText(file);
  if (byteLength(text) > EXPORT_MAX_BYTES) {
    // The estimate is generous, so this should never happen. If it does,
    // still send the file: Netlify allows more than our limit.
    console.error('offers-export: file larger than planned', byteLength(text));
  }
  return new Response(text, {
    status: 200,
    headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"` }
  });
}

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET'] });
  if (refused) return refused;
  const deployContext = context?.deploy?.context ?? null;
  const where = deployContext === 'production' ? 'live' : 'test';
  const q = new URL(req.url).searchParams;
  const wantRest = q.has('images');
  if (wantRest && q.get('images') !== 'rest') return json({ error: 'Use ?images=rest for the pictures file.' }, 400);
  let part = 1;
  if (wantRest) {
    part = q.has('part') ? Number(q.get('part')) : 2;
    if (!Number.isSafeInteger(part) || part < 2 || part > MAX_PART) {
      return json({ error: 'That part number is not valid.' }, 400);
    }
  } else if (q.has('part')) {
    return json({ error: 'That part number is not valid.' }, 400);
  }

  try {
    const { offers } = await loadOffers(offersStore(deployContext));
    const now = new Date();
    const ids = referencedIds(offers);

    const offersFile = {
      kind: 'yavd-offers-export',
      contract: CONTRACT_VERSION,
      exportedAt: now.toISOString(),
      deployContext,
      store: offersStoreName(deployContext),
      count: offers.length,
      offers,
      images: [],
      imagesOmitted: [],
      imagesMissing: [],
      imagesNote: ''
    };
    const restFile = (n) => ({
      kind: 'yavd-offers-export-images',
      contract: CONTRACT_VERSION,
      exportedAt: now.toISOString(),
      deployContext,
      store: imagesStoreName(deployContext),
      part: n,
      parts: 1,
      images: [],
      imagesOmitted: [],
      imagesMissing: [],
      imagesNote: '',
      next: null
    });

    // Opening the picture store is skipped when no offer has a picture.
    let store = null;
    let plan = { parts: [[]], missing: [] };
    if (ids.length) {
      try { store = imagesStore(deployContext); } catch { store = null; }
      // Room the file needs without any picture: measured on the empty
      // shell, with every id listed as omitted or missing (an upper bound).
      const worst = (f) => byteLength(toText({ ...f, imagesOmitted: ids, imagesMissing: ids,
        imagesNote: note(1, 2, ids), next: f.next === undefined ? undefined : partUrl(MAX_PART) }));
      plan = store
        ? await planParts(store, ids, worst(offersFile), worst(restFile(MAX_PART)))
        : { parts: [[]], missing: [...ids] };
    }
    const parts = plan.parts.length;
    const missing = [...plan.missing];
    const later = (n) => plan.parts.slice(n).flat();   // ids in parts after part n

    if (!wantRest) {
      offersFile.images = store ? await readPart(store, plan.parts[0], missing) : [];
      offersFile.imagesOmitted = later(1);
      offersFile.imagesMissing = missing;
      offersFile.imagesNote = note(1, parts, missing);
      return respond(offersFile, `yavd-offers-${where}-${stamp(now)}.json`);
    }

    const file = restFile(part);
    file.parts = parts;
    if (part <= parts) {
      file.images = await readPart(store, plan.parts[part - 1], missing);
      file.imagesOmitted = later(part);
      file.next = part < parts ? partUrl(part + 1) : null;
    }
    file.imagesMissing = missing;
    file.imagesNote = part > parts
      ? 'Nothing more to download: every picture fits in the earlier files.'
      : note(part, parts, missing);
    const suffix = part > 2 ? `-part${part}` : '';
    return respond(file, `yavd-offers-${where}-images${suffix}-${stamp(now)}.json`);
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error('offers-export: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong with the export.' }, 500);
  }
};

export const config = { path: '/api/offers/export' };
