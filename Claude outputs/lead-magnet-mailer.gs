/**
 * Lead magnet mailer - Your AV Department
 *
 * Receives a Netlify Forms webhook and emails the reader their guide.
 * Sends through Resend so the From address is michaelh@youravdept.com with
 * DKIM signed by your own domain.
 *
 * ADDING A NEW LEAD MAGNET LATER
 * 1. Drop the PDF in the site repo under library/pdf/.
 * 2. Add one entry to the GUIDES table below and deploy a new version.
 * 3. On the new landing page, set the form's hidden field to the matching key:
 *      <input type="hidden" name="guide" value="The Name Of Your Guide">
 *    Give the Netlify form its own name, then point a form-submission webhook
 *    at this same /exec URL. One script serves every guide.
 *
 * ONE TIME SETUP
 * A. Resend
 *    1. Sign up at resend.com (free tier is 3,000 emails/month).
 *    2. Domains > Add Domain > youravdept.com.
 *    3. Resend shows DNS records. Add them in Netlify:
 *       Domains > youravdept.com > DNS records > Add record.
 *       Add every record shown, including the DKIM TXT and the MX for the
 *       send subdomain. Keep your existing Google MX records untouched;
 *       Resend uses a subdomain so it will not affect your inbox mail.
 *    4. Wait for the domain to read Verified. Usually minutes, up to 48 hours.
 *    5. API Keys > Create API Key. Permission: Sending access. Copy it once.
 * B. Apps Script
 *    6. Project Settings (gear) > Script Properties > Add script property
 *         Property: RESEND_API_KEY
 *         Value:    the re_... key from step 5
 *       Storing it here keeps the key out of the code.
 *    7. Run testSend and confirm the email arrives with a clean From line.
 *    8. Deploy > New deployment > Web app
 *         Execute as:     Me
 *         Who has access: Anyone
 *    9. Open the /exec URL in a private window. You should see the running
 *       message. Do not wire up Netlify until you do.
 *   10. Netlify > Forms > your form > form submission notifications >
 *       HTTP POST request. URL is the /exec URL. Leave the JWS secret empty.
 *
 * NOTE: after ANY edit to this file you must deploy again
 * (Deploy > Manage deployments > pencil icon > Version: New version).
 * Editing alone does not update the live web app.
 */

// ---------------------------------------------------------------- config

var FROM        = 'Michael Harward <michaelh@youravdept.com>';
var REPLY_TO    = 'michaelh@youravdept.com';
var BCC_ME      = 'michaelh@youravdept.com';   // '' to turn off
var SITE        = 'https://youravdept.com';
var LIBRARY_URL = SITE + '/library/';

/**
 * Every lead magnet. The key must match the form's hidden "guide" field
 * exactly, including capitalisation.
 */
var GUIDES = {
  'The Levers of Labor': {
    file:    'https://drive.google.com/file/d/1Wk5kSfM2D7oYTn1nXIaLIzx8syKxCQhO/view?usp=sharing',
    subject: 'Your copy of The Levers of Labor',
    blurb:   'Six pages on what actually builds the labor line on your production ' +
             'budget and the five questions worth asking.'
  }
  // ,'Next Guide Name': {
  //   file:    SITE + '/library/pdf/next-guide.pdf',
  //   subject: 'Your copy of Next Guide Name',
  //   blurb:   'One sentence on what the reader gets.'
  // }
};

var DEFAULT_GUIDE = 'The Levers of Labor';

// ---------------------------------------------------------------- webhook

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // Netlify nests the submitted fields under "data".
    var d = body.data || body.payload || body;

    var email = String(d.email || '').trim();
    var first = String(d.first_name || '').trim();
    var key   = String(d.guide || '').trim();

    if (!email || email.indexOf('@') < 0) {
      return out({ ok: false, error: 'no email in payload' });
    }

    var guide = GUIDES[key] || GUIDES[DEFAULT_GUIDE];
    if (!guide) {
      return out({ ok: false, error: 'unknown guide: ' + key });
    }

    sendGuide(email, first, guide);
    return out({ ok: true, guide: key || DEFAULT_GUIDE });

  } catch (err) {
    console.error(err);
    notifyFailure('doPost threw', String(err));
    // Deliberately a 200. A non-2xx here makes Netlify disable the hook
    // after six failures, which is how the last setup went dark silently.
    return out({ ok: false, error: String(err) });
  }
}

/** Lets you open the /exec URL in a browser to confirm the app is live. */
function doGet() {
  return ContentService.createTextOutput('Lead magnet mailer is running.');
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- sending

function sendGuide(email, first, guide) {
  var greeting = first ? ('Hi ' + first + ',') : 'Hi,';

  var payload = {
    from:     FROM,
    to:       [email],
    reply_to: REPLY_TO,
    subject:  guide.subject,
    text:     plainBody(greeting, guide),
    html:     htmlBody(greeting, guide)
  };
  if (BCC_ME) payload.bcc = [BCC_ME];

  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    // Resend refused. Fall back to Gmail so the reader still gets the guide,
    // then tell Michael the primary path is broken.
    console.error('Resend ' + code + ': ' + res.getContentText());
    notifyFailure('Resend returned ' + code, res.getContentText());
    MailApp.sendEmail({
      to: email,
      replyTo: REPLY_TO,
      name: 'Michael Harward',
      subject: guide.subject,
      body: plainBody(greeting, guide),
      htmlBody: htmlBody(greeting, guide)
    });
  }
}

function apiKey() {
  var k = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (!k) throw new Error('RESEND_API_KEY is not set in Script Properties.');
  return k;
}

/** Quiet alert to Michael when the primary send path fails. */
function notifyFailure(what, detail) {
  try {
    MailApp.sendEmail(REPLY_TO,
      '[youravdept] lead magnet mailer problem',
      what + '\n\n' + detail + '\n\nThe reader was sent the guide via the Gmail fallback.');
  } catch (ignore) {}
}

// ---------------------------------------------------------------- content

function plainBody(greeting, guide) {
  return greeting + '\n\n' +
    'Here is your copy. ' + guide.blurb + '\n\n' +
    guide.file + '\n\n' +
    'If you are staring at a labor line right now and something on it does not add up, ' +
    'reply to this email and send it over. I am happy to give you a read on it.\n\n' +
    'Michael Harward\n' +
    'Your AV Department\n' +
    'michaelh@youravdept.com | 502.418.3488 | youravdept.com';
}

function htmlBody(greeting, guide) {
  return '' +
  '<div style="font-family:\'Open Sans\',Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#44556E;max-width:560px;">' +
    '<p style="margin:0 0 16px;">' + greeting + '</p>' +
    '<p style="margin:0 0 22px;">Here is your copy. ' + guide.blurb + '</p>' +

    '<p style="margin:0 0 24px;">' +
      '<a href="' + guide.file + '" ' +
         'style="display:inline-block;background:#152B4A;color:#ffffff;font-family:Montserrat,Helvetica,Arial,sans-serif;' +
         'font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">' +
        'Read the guide' +
      '</a>' +
    '</p>' +

    '<p style="margin:0 0 16px;font-size:13px;color:#57667D;">' +
      'Button not working? <a href="' + guide.file + '" style="color:#2AA4A2;">Open the guide here</a>.' +
    '</p>' +

    '<p style="margin:0 0 16px;">If you are staring at a labor line right now and something on it does not add up, reply to this email and send it over. I am happy to give you a read on it.</p>' +

    '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #E3E9EE;">' +
      '<b style="color:#152B4A;">Michael Harward</b><br>' +
      '<span style="color:#2AA4A2;font-weight:700;">Your AV Department</span><br>' +
      '<a href="mailto:michaelh@youravdept.com" style="color:#2AA4A2;">michaelh@youravdept.com</a> &middot; ' +
      '502.418.3488 &middot; ' +
      '<a href="' + SITE + '/" style="color:#2AA4A2;">youravdept.com</a>' +
    '</p>' +

    '<p style="margin:18px 0 0;font-size:12px;color:#8A97A8;">' +
      'More guides as I write them: <a href="' + LIBRARY_URL + '" style="color:#2AA4A2;">youravdept.com/library</a>' +
    '</p>' +
  '</div>';
}

// ---------------------------------------------------------------- tests

/** Mails yourself a test copy through Resend. */
function testSend() {
  sendGuide(REPLY_TO, 'Michael', GUIDES[DEFAULT_GUIDE]);
}

/**
 * Simulates the exact JSON Netlify posts, without the network. If this
 * succeeds and a real submission does not, the problem is the webhook
 * wiring rather than this script.
 */
function testWebhookPayload() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        form_name: 'levers-of-labor',
        data: {
          guide: 'The Levers of Labor',
          first_name: 'Michael',
          email: REPLY_TO,
          organization: 'Your AV Department'
        }
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}

/** Confirms the API key is present and Resend accepts it. */
function testApiKey() {
  var res = UrlFetchApp.fetch('https://api.resend.com/domains', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + apiKey() },
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
