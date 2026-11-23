// Builds ai/review/4.10/index.html: one self-contained review page (Session 4.10).
// The six screenshots are embedded as data: URIs, so the page has no other files.
// Re-run after the screenshots change:  node ai/review/4.10/build-review.mjs
// (the screenshots come from: node --test netlify/tests/landing-expired.test.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const screens = [
  { file: 'running-desktop.png', title: 'Live page, computer', tall: true,
    shows: 'A live landing page as a visitor sees it on a computer (1280 px wide), whole page top to bottom: small emblem logo, eyebrow, headline with a teal second line, picture, copy with bullets, the navy band with the button, then the footer.',
    judge: ['Headline size and weight', 'Picture crop and rounded corners', 'Button colour and label on the navy band', 'Overall: does it feel like Your AV Department?'] },
  { file: 'running-phone.png', title: 'Live page, phone', tall: true,
    shows: 'The same page on a phone (390 px wide). The button becomes full width.',
    judge: ['Headline wraps cleanly and is not too big', 'Picture still reads at phone size', 'Copy is comfortable to read', 'Button is easy to tap'] },
  { file: 'expired-desktop.png', title: 'Expired page with popup, computer', tall: false,
    shows: 'The page after its offer has ended. The page button is gone and, about half a second after the page loads, the expiration popup opens over it. Wording, button and email come word for word from the contract.',
    judge: ['Popup wording reads well (changing it needs your word; it lives in the contract)', 'Contact button: colour and label', 'Email link beneath', 'Close mark (top right) is easy to find'] },
  { file: 'expired-phone.png', title: 'Expired page with popup, phone', tall: false,
    shows: 'The same expired page on a phone. The popup fits the screen, the Contact button is full width, and the close mark is a full size tap target.',
    judge: ['Popup is readable and not cramped', 'Nothing is cut off', 'Easy to close'] },
  { file: 'no-picture.png', title: 'Live page with no picture', tall: true,
    shows: 'A live page saved without a picture, on a computer. The copy moves up under the headline.',
    judge: ['Still looks finished, not empty', 'Gap between headline and copy feels right'] },
  { file: 'long-headline.png', title: 'Long headline, phone', tall: true,
    shows: 'A deliberately long headline (about 140 characters) on a phone, to show the worst case.',
    judge: ['It wraps without running off the screen', 'Is it too much? (A shorter headline limit could be a later change)'] }
];

for (const s of screens) {
  const buf = fs.readFileSync(path.join(DIR, s.file));
  s.src = 'data:image/png;base64,' + buf.toString('base64');
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slides = screens.map((s, i) => `
<section class="slide" id="s${i + 1}" aria-label="Screen ${i + 1} of ${screens.length}: ${esc(s.title)}"${i ? ' hidden' : ''}>
  <div class="info">
    <p class="count">Screen ${i + 1} of ${screens.length}</p>
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.shows)}</p>
    <p class="label">What to judge</p>
    <ul>${s.judge.map((j) => `<li>${esc(j)}</li>`).join('')}</ul>
    ${s.tall ? '<p class="hint">Whole page shown. Click the picture to see it full size and scroll; click again to fit.</p>' : ''}
  </div>
  <div class="frame"><img src="${s.src}" alt="${esc(s.title)}" data-tall="${s.tall ? '1' : '0'}"></div>
</section>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Landing Page Review</title>
<style>
:root{--bg:#F4F6F9;--panel:#FFFFFF;--ink:#152B4A;--muted:#4A5B73;--rule:#D9DFE7;--accent:#2AA4A2;--accent-ink:#1F7F7D;--note:#FFF7DA;--note-rule:#E8D48A}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0E1726;--panel:#16233A;--ink:#E8EEF6;--muted:#A9B6C8;--rule:#2A3A55;--accent:#2AA4A2;--accent-ink:#5CCFCC;--note:#2B2717;--note-rule:#5C5124}}
:root[data-theme="dark"]{--bg:#0E1726;--panel:#16233A;--ink:#E8EEF6;--muted:#A9B6C8;--rule:#2A3A55;--accent:#2AA4A2;--accent-ink:#5CCFCC;--note:#2B2717;--note-rule:#5C5124}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,"Segoe UI",Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--rule);background:var(--panel)}
header h1{margin:0;font:700 16px/1.2 Montserrat,"Segoe UI",Arial,sans-serif;flex:1}
header .sub{color:var(--muted);font-size:13px}
.notes-btn{border:1px solid var(--rule);background:transparent;color:var(--ink);border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.notes{display:none;margin:0;padding:10px 16px;background:var(--note);border-bottom:1px solid var(--note-rule);font-size:14px}
.notes.open{display:block}
.notes ul{margin:4px 0 0;padding-left:20px}
main{flex:1;min-height:0;position:relative}
.slide{position:absolute;inset:0;display:flex;gap:16px;padding:16px}
.slide[hidden]{display:none}
.info{flex:0 0 300px;overflow:auto;background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}
.info h2{margin:2px 0 8px;font:700 18px/1.25 Montserrat,"Segoe UI",Arial,sans-serif}
.info p{margin:0 0 10px}
.info ul{margin:0 0 10px;padding-left:20px}
.count{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin:0}
.label{font-weight:700;margin-top:12px!important}
.hint{color:var(--muted);font-size:13px}
.frame{flex:1;min-width:0;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:10px}
.frame img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 4px 18px rgba(10,22,40,.18);cursor:zoom-in;align-self:center}
.frame.full{overflow:auto;align-items:flex-start}
.frame.full img{max-width:none;max-height:none;cursor:zoom-out;align-self:flex-start}
nav{display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 16px;border-top:1px solid var(--rule);background:var(--panel)}
nav button.step{border:0;background:var(--accent);color:#152B4A;font:700 14px/1 Montserrat,"Segoe UI",Arial,sans-serif;padding:11px 18px;border-radius:6px;cursor:pointer;min-width:90px}
nav button.step:disabled{opacity:.4;cursor:default}
.dots{display:flex;gap:8px}
.dots button{width:14px;height:14px;border-radius:50%;border:2px solid var(--accent);background:transparent;padding:0;cursor:pointer}
.dots button[aria-current="true"]{background:var(--accent)}
button:focus-visible{outline:3px solid var(--accent-ink);outline-offset:2px}
@media (max-width:760px){
  .slide{flex-direction:column;gap:10px;padding:10px 16px}
  .info{flex:0 0 auto;max-height:38%}
  header .sub{display:none}
  nav button.step{min-width:0;padding:10px 14px}
}
</style>
</head>
<body>
<header>
  <h1>Landing pages: review before the admin is built</h1>
  <span class="sub">Session 4.10 &middot; arrow keys work</span>
  <button class="notes-btn" type="button" aria-expanded="true" aria-controls="notes">Look notes</button>
</header>
<div class="notes open" id="notes">
  <strong>Carried from Session 4.8, for you to confirm or change:</strong>
  <ul>
    <li>The page uses the small emblem logo (the one in the site header), not the larger Booth Proof logo.</li>
    <li>The page is white, with a navy band behind the button (the band carries a soft teal glow).</li>
    <li>The picture and text in these screens are test content made for this review, not a real offer.</li>
    <li>Andy should brand-check the first sample page: colours, fonts, logo and contact details.</li>
  </ul>
</div>
<main>${slides}
</main>
<nav aria-label="Screens">
  <button class="step" type="button" id="prev">Back</button>
  <div class="dots" id="dots"></div>
  <button class="step" type="button" id="next">Next</button>
</nav>
<script>
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dots = document.getElementById('dots');
  var prev = document.getElementById('prev'), next = document.getElementById('next');
  var cur = 0;
  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Screen ' + (i + 1) + ': ' + s.querySelector('h2').textContent);
    b.addEventListener('click', function () { go(i); });
    dots.appendChild(b);
    var frame = s.querySelector('.frame');
    s.querySelector('img').addEventListener('click', function () { frame.classList.toggle('full'); frame.scrollTop = 0; });
  });
  function go(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, j) { s.hidden = j !== cur; if (j !== cur) s.querySelector('.frame').classList.remove('full'); });
    Array.prototype.forEach.call(dots.children, function (d, j) { d.setAttribute('aria-current', j === cur ? 'true' : 'false'); });
    prev.disabled = cur === 0;
    next.disabled = cur === slides.length - 1;
  }
  prev.addEventListener('click', function () { go(cur - 1); });
  next.addEventListener('click', function () { go(cur + 1); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); }
  });
  var nb = document.querySelector('.notes-btn'), notes = document.getElementById('notes');
  nb.addEventListener('click', function () { var o = notes.classList.toggle('open'); nb.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  go(0);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log('wrote', path.join(DIR, 'index.html'), Math.round(html.length / 1024) + ' KB');
