/**
 * Netlify Forms -> Resend lead magnet mailer
 * Your AV Department
 *
 * Netlify runs this automatically on every form submission, because of the
 * filename. There is no webhook to configure and nothing to keep in sync.
 *
 * ADDING A NEW LEAD MAGNET
 * 1. Put the PDF somewhere public (site repo, or Drive with link sharing on).
 * 2. Add an entry to GUIDES below. The key must match the form's hidden
 *    "guide" field exactly, including capitalisation.
 * 3. Give the new form its own name attribute and a hidden field:
 *      <input type="hidden" name="guide" value="Exact GUIDES Key">
 *    Nothing else. This function handles every form on the site.
 *
 * SETUP (once)
 *   Netlify > Site configuration > Environment variables:
 *     RESEND_API_KEY = the re_... key with Sending access
 *   Redeploy for it to take effect.
 *
 * WHY THIS REPLACED THE APPS SCRIPT WEBHOOK (2026-09-14)
 *   Apps Script web apps always answer with a 302 redirect. Netlify's outgoing
 *   webhooks count that as a failure, retry, and disable the hook after six
 *   consecutive "failures". The script was running fine and sending mail; the
 *   webhook was being switched off underneath it. Symptoms were duplicate
 *   emails followed by total silence. This function has no webhook and no
 *   redirect, so the whole class of problem is gone.
 */

const FROM        = 'Michael Harward <michaelh@youravdept.com>';
const REPLY_TO    = 'michaelh@youravdept.com';
const BCC_ME      = 'michaelh@youravdept.com';   // '' to turn off
const SITE        = 'https://youravdept.com';
const LIBRARY_URL = `${SITE}/library/`;

const GUIDES = {
  'The Levers of Labor': {
    file:    'https://drive.google.com/file/d/1Wk5kSfM2D7oYTn1nXIaLIzx8syKxCQhO/view?usp=sharing',
    subject: 'Your copy of The Levers of Labor',
    blurb:   'Six pages on what actually builds the labor line on your production budget and the five questions worth asking.'
  }
  // ,'Next Guide Name': {
  //   file:    `${SITE}/library/pdf/next-guide.pdf`,
  //   subject: 'Your copy of Next Guide Name',
  //   blurb:   'One sentence on what the reader gets.'
  // }
};

const DEFAULT_GUIDE = 'The Levers of Labor';

export default async (req) => {
  // Always 200. Netlify should never treat a send problem as a delivery
  // problem, and a lead is already captured in Forms regardless.
  const ok = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  let payload;
  try {
    const body = await req.json();
    payload = body.payload || body;
  } catch (err) {
    console.error('could not parse submission body:', err);
    return ok({ ok: false, error: 'unparseable body' });
  }

  const d     = payload.data || {};
  const email = String(d.email || payload.email || '').trim();
  const first = String(d.first_name || '').trim();
  const key   = String(d.guide || '').trim();
  const subId = payload.id || '(no id)';

  console.log(`submission ${subId} form=${payload.form_name} guide="${key}" to=${email}`);

  if (!email || !email.includes('@')) {
    console.error(`submission ${subId}: no usable email address`);
    return ok({ ok: false, error: 'no email' });
  }

  const guide = GUIDES[key] || GUIDES[DEFAULT_GUIDE];
  if (!guide) {
    console.error(`submission ${subId}: unknown guide "${key}" and no default`);
    return ok({ ok: false, error: 'unknown guide' });
  }
  if (!GUIDES[key]) {
    console.warn(`submission ${subId}: guide "${key}" not in GUIDES, sent default`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in Netlify environment variables');
    return ok({ ok: false, error: 'missing api key' });
  }

  const greeting = first ? `Hi ${first},` : 'Hi,';
  const body = {
    from: FROM,
    to: [email],
    reply_to: REPLY_TO,
    subject: guide.subject,
    text: plainBody(greeting, guide),
    html: htmlBody(greeting, guide)
  };
  if (BCC_ME) body.bcc = [BCC_ME];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`submission ${subId}: Resend ${res.status} ${text}`);
      return ok({ ok: false, status: res.status });
    }
    console.log(`submission ${subId}: sent, resend=${text}`);
    return ok({ ok: true });

  } catch (err) {
    console.error(`submission ${subId}: fetch to Resend threw:`, err);
    return ok({ ok: false, error: String(err) });
  }
};

function plainBody(greeting, guide) {
  return [
    greeting,
    '',
    `Here is your copy. ${guide.blurb}`,
    '',
    guide.file,
    '',
    'If you are staring at a labor line right now and something on it does not add up, reply to this email and send it over. I am happy to give you a read on it.',
    '',
    'Michael Harward',
    'Your AV Department',
    'michaelh@youravdept.com | 502.418.3488 | youravdept.com'
  ].join('\n');
}

function htmlBody(greeting, guide) {
  return `<div style="font-family:'Open Sans',Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#44556E;max-width:560px;">
  <p style="margin:0 0 16px;">${greeting}</p>
  <p style="margin:0 0 22px;">Here is your copy. ${guide.blurb}</p>

  <p style="margin:0 0 24px;">
    <a href="${guide.file}" style="display:inline-block;background:#152B4A;color:#ffffff;font-family:Montserrat,Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">Read the guide</a>
  </p>

  <p style="margin:0 0 16px;font-size:13px;color:#57667D;">
    Button not working? <a href="${guide.file}" style="color:#2AA4A2;">Open the guide here</a>.
  </p>

  <p style="margin:0 0 16px;">If you are staring at a labor line right now and something on it does not add up, reply to this email and send it over. I am happy to give you a read on it.</p>

  <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #E3E9EE;">
    <b style="color:#152B4A;">Michael Harward</b><br>
    <span style="color:#2AA4A2;font-weight:700;">Your AV Department</span><br>
    <a href="mailto:michaelh@youravdept.com" style="color:#2AA4A2;">michaelh@youravdept.com</a> &middot;
    502.418.3488 &middot;
    <a href="${SITE}/" style="color:#2AA4A2;">youravdept.com</a>
  </p>

  <p style="margin:18px 0 0;font-size:12px;color:#8A97A8;">
    More guides as I write them: <a href="${LIBRARY_URL}" style="color:#2AA4A2;">youravdept.com/library</a>
  </p>
</div>`;
}
