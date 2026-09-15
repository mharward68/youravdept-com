/**
 * The Levers of Labor - lead magnet mailer
 * Your AV Department
 *
 * Receives a Netlify Forms webhook and emails the reader a link to the guide.
 * Asks for one permission only: send email as you.
 *
 * WHY THIS LIVES IN A PERSONAL GOOGLE ACCOUNT
 * The youravdept.com Workspace copy could not serve anonymous requests, so
 * Netlify's webhook got a 4xx every time and the hook was disabled. Consumer
 * Google accounts allow "Anyone" web app access by default, which is what a
 * webhook needs. Nothing in this script touches Drive or Sheets, so it runs
 * identically from either account.
 *
 * SETUP
 * 1. Sign in to your PERSONAL Google account (not youravdept.com).
 * 2. Go to script.google.com, click New project, and paste this whole file
 *    over whatever is there. Rename the project "Levers of Labor mailer".
 * 3. Choose testSend in the function dropdown and click Run.
 *    Approve the permission prompt. Click through "Advanced" then
 *    "Go to ... (unsafe)" if it appears; that warning is normal for your
 *    own unpublished script. Confirm the test email arrives.
 * 4. Deploy > New deployment > gear icon > Web app
 *      Execute as:       Me
 *      Who has access:   Anyone          <-- must be Anyone, not "Anyone with a Google account"
 *    Deploy, then copy the Web app URL (it ends in /exec).
 * 5. Open that /exec URL in a private window. You should see
 *    "Levers of Labor mailer is running." If you get a sign-in page or an
 *    error, step 4 is wrong. Do not continue until this works.
 * 6. Netlify > Forms > levers-of-labor > form submission notifications.
 *    Edit the existing disabled hook: replace the URL with the new /exec URL,
 *    leave the JWS secret empty, and save. Saving re-enables it.
 * 7. Submit the real form once at youravdept.com/library/the-levers-of-labor
 *    and confirm the email arrives.
 *
 * NOTE: after ANY edit to this file you must deploy again
 * (Deploy > Manage deployments > pencil icon > Version: New version).
 * Editing alone does not update the live web app.
 */

var GUIDE_URL   = 'https://youravdept.com/library/pdf/the-levers-of-labor.pdf';
var LIBRARY_URL = 'https://youravdept.com/library/';
var FROM_NAME   = 'Michael Harward';
var REPLY_TO    = 'michaelh@youravdept.com';
var BCC_ME      = 'michaelh@youravdept.com';    // '' to turn off
var SUBJECT     = 'Your copy of The Levers of Labor';

/**
 * Optional. Sends from michaelh@youravdept.com instead of the personal
 * Gmail address. Leave '' until the alias is set up, or every send fails.
 *
 * To enable: in the personal Gmail account, Settings > Accounts and Import >
 * "Send mail as" > Add another email address > michaelh@youravdept.com.
 * Verify it via the confirmation email. Once verified, set this to
 * 'michaelh@youravdept.com' and redeploy a new version.
 */
var SEND_AS = '';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // Netlify nests the form fields under "data".
    var d = body.data || body.payload || body;

    var email = String(d.email || '').trim();
    var first = String(d.first_name || '').trim();

    if (!email || email.indexOf('@') < 0) {
      return out({ ok: false, error: 'no email in payload' });
    }

    sendGuide(email, first);
    return out({ ok: true });

  } catch (err) {
    console.error(err);
    return out({ ok: false, error: String(err) });
  }
}

/** Lets you open the /exec URL in a browser to confirm it is live. */
function doGet() {
  return ContentService.createTextOutput('Levers of Labor mailer is running.');
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendGuide(email, first) {
  var greeting = first ? ('Hi ' + first + ',') : 'Hi,';

  var opts = {
    to: email,
    replyTo: REPLY_TO,
    name: FROM_NAME,
    subject: SUBJECT,
    body: plainBody(greeting),
    htmlBody: htmlBody(greeting)
  };
  if (BCC_ME) opts.bcc = BCC_ME;
  if (SEND_AS) opts.from = SEND_AS;

  MailApp.sendEmail(opts);
}

function plainBody(greeting) {
  return greeting + '\n\n' +
    'Here is The Levers of Labor:\n' +
    GUIDE_URL + '\n\n' +
    'Six pages on what actually builds the labor line on your production budget, ' +
    'and the five questions worth asking before you ask for a discount.\n\n' +
    'If you are staring at a labor line right now and something on it does not add up, ' +
    'reply to this email and send it over. I am happy to give you a read on it.\n\n' +
    'Michael Harward\n' +
    'Your AV Department\n' +
    'michaelh@youravdept.com | 502.418.3488 | youravdept.com';
}

function htmlBody(greeting) {
  return '' +
  '<div style="font-family:\'Open Sans\',Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#44556E;max-width:560px;">' +
    '<p style="margin:0 0 16px;">' + greeting + '</p>' +
    '<p style="margin:0 0 22px;">Here is <b style="color:#152B4A;">The Levers of Labor</b>. Six pages on what actually builds the labor line on your production budget, and the five questions worth asking before you ask for a discount.</p>' +

    '<p style="margin:0 0 24px;">' +
      '<a href="' + GUIDE_URL + '" ' +
         'style="display:inline-block;background:#152B4A;color:#ffffff;font-family:Montserrat,Helvetica,Arial,sans-serif;' +
         'font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">' +
        'Read the guide' +
      '</a>' +
    '</p>' +

    '<p style="margin:0 0 16px;font-size:13px;color:#57667D;">' +
      'Or paste this into your browser: <a href="' + GUIDE_URL + '" style="color:#2AA4A2;">' + GUIDE_URL + '</a>' +
    '</p>' +

    '<p style="margin:0 0 16px;">If you are staring at a labor line right now and something on it does not add up, reply to this email and send it over. I am happy to give you a read on it.</p>' +

    '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #E3E9EE;">' +
      '<b style="color:#152B4A;">Michael Harward</b><br>' +
      '<span style="color:#2AA4A2;font-weight:700;">Your AV Department</span><br>' +
      '<a href="mailto:michaelh@youravdept.com" style="color:#2AA4A2;">michaelh@youravdept.com</a> &middot; ' +
      '502.418.3488 &middot; ' +
      '<a href="https://youravdept.com/" style="color:#2AA4A2;">youravdept.com</a>' +
    '</p>' +

    '<p style="margin:18px 0 0;font-size:12px;color:#8A97A8;">' +
      'More guides as I write them: <a href="' + LIBRARY_URL + '" style="color:#2AA4A2;">youravdept.com/library</a>' +
    '</p>' +
  '</div>';
}

/** Run this to mail yourself a test copy. */
function testSend() {
  sendGuide(REPLY_TO, 'Michael');
}

/**
 * Run this to simulate exactly what Netlify posts, without going through
 * the network. If this succeeds and a real submission does not, the problem
 * is the webhook wiring, not this script.
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
