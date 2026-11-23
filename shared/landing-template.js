/**
 * YAVD Offers Module: the landing page template (Session 4.8, contract 1.4.0).
 *
 * renderLanding(landing, { state, isPreview }) turns one landing record and
 * its worked-out state into the complete page HTML plus the response headers.
 * The serving function (netlify/functions/offer-landing.mjs, Session 4.9)
 * applies both; the admin preview (Session 4.13) uses only the HTML.
 *
 * Safe by construction:
 * - The page is one fixed template. Every value from the record is escaped
 *   (& < > " ') before it is placed, text and attributes alike. No stored or
 *   typed HTML ever reaches the page.
 * - Eyebrow, headline and copy keep the offer formatting tags
 *   (shared/offer-format.js). They become spans with fixed class names only.
 * - The call to action link is checked again here: https:// or a same-site
 *   path ("/page"), nothing else. Anything else and the button is left out.
 * - The picture address is always imageUrl(id) built from a valid id. The
 *   admin preview may pass imageSrc (a blob:, data:image or same-site
 *   address) for a picture not saved yet; anything else is ignored.
 * - The only scripts are the site's analytics tag (as Netlify injects it on
 *   the static pages; function responses get no injection, so it is written
 *   here) and, on expired and archived pages, /assets/landing-expired.js.
 *   The Content-Security-Policy allows exactly those, the inline style and
 *   the analytics script by hash.
 *
 * Pure ES module: no Node-only code, no secrets, no clock, no randomness, so
 * the same record always gives the same bytes. Published on purpose (shared/
 * is public, like offer-contract.js): the browser preview imports it.
 *
 * If you change STYLE or GA_INLINE, the two hashes below must change too.
 * netlify/tests/landing-render.test.mjs computes them and says the new value.
 */

import { IMAGE, LANDING_EXPIRED, imageUrl, isValidSlug, landingPath, payloadToScriptJson } from './offer-contract.js';
import { classesFor, parseMarkup, plainFromMarkup, toBlocks } from './offer-format.js';

export const TEMPLATE_VERSION = '1.0.0';

/** States that hide the call to action and carry the expiration popup (4.10). */
export const EXPIRED_STATES = Object.freeze(['expired', 'archived']);

/** Element id of the expiration data block read by /assets/landing-expired.js. */
export const EXPIRED_DATA_ID = 'yavd-landing-expired';

/** The two files Session 4.10 creates. Tags point at them from 4.8 on. */
export const EXPIRED_ASSETS = Object.freeze({
  css: '/assets/landing-expired.css',
  js: '/assets/landing-expired.js'
});

export const SITE = Object.freeze({
  name: 'Your AV Department',
  email: 'michaelh@youravdept.com',
  url: 'https://youravdept.com/',
  host: 'youravdept.com',
  origin: 'https://youravdept.com'
});

/** Google Analytics 4, exactly as Netlify injects it on the live pages (read 2026-11-23 from /booth-proof). */
export const GA_ID = 'G-R6463ELTHL';
export const GA_INLINE = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GA_ID}');
`;

/* The page style. Static text only (nothing interpolated), so its hash is fixed.
   :root tokens, body and heading fonts copied from booth-proof.html. */
export const STYLE = `
:root{--navy:#152B4A;--teal:#2AA4A2;--white:#FFFFFF;--tint:#EAF6F6;--rule:#D9DFE7;--navy2:#1D3A61}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--white);color:var(--navy);font-family:Inter,"Open Sans",Arial,sans-serif;font-size:17px;line-height:1.6}
h1{font-family:Montserrat,"Proxima Nova",Arial,sans-serif;font-weight:800;line-height:1.12;margin:0;text-wrap:balance}
a{color:#1F7F7D}
p{margin:0 0 14px}
.yl-wrap{max-width:960px;margin:0 auto;padding:0 20px}
.yl-text{max-width:720px}
.yl-preview{background:#FFF4CE;color:var(--navy);font-size:14px;font-weight:600;text-align:center;padding:8px 20px;border-bottom:1px solid #E8D48A}
.yl-top{border-bottom:1px solid var(--rule)}
.yl-top .yl-wrap{display:flex;align-items:center;min-height:68px}
.yl-brand{display:inline-flex;align-items:center;gap:12px;color:var(--navy);text-decoration:none;font-family:Montserrat,Arial,sans-serif;font-weight:800;font-size:16px;letter-spacing:.01em;padding:10px 0;border-radius:6px}
.yl-brand img{width:40px;height:40px;display:block}
.yl-hero{padding:44px 0 30px}
.yl-eyebrow{font-family:Montserrat,Arial,sans-serif;font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#1F7F7D;margin:0 0 12px;overflow-wrap:anywhere}
.yl-hero h1{font-size:clamp(32px,5.6vw,54px);color:var(--navy);overflow-wrap:anywhere;hyphens:auto}
.yl-pic{margin:6px 0 0}
.yl-pic img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover;border-radius:14px;background:var(--tint);box-shadow:0 18px 40px -24px rgba(21,43,74,.55)}
.yl-copy{padding:34px 0 10px;font-size:18px;line-height:1.65;overflow-wrap:anywhere}
.yl-copy ul{margin:0 0 16px;padding:0 0 0 1.3em}
.yl-copy li{margin:0 0 8px;padding-left:.2em}
.yl-copy li::marker{color:var(--teal)}
.yl-cta{margin:26px 0 0;background:var(--navy);background-image:radial-gradient(700px 360px at 15% 100%,rgba(42,164,162,.3),transparent 60%);color:var(--white);padding:46px 0;text-align:center}
.yl-btn{display:inline-block;max-width:100%;background:var(--teal);color:var(--navy);font-family:Montserrat,Arial,sans-serif;font-weight:700;font-size:18px;line-height:1.3;text-decoration:none;padding:16px 30px;border-radius:6px;overflow-wrap:anywhere;transition:transform .15s ease,background .15s ease}
.yl-btn:hover{background:#45BDBB;transform:translateY(-2px)}
.yl-btn:focus-visible,.yl-brand:focus-visible,.yl-foot a:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
.yl-cta .yl-btn:focus-visible{outline-color:var(--white)}
.yl-foot{padding:26px 0 34px;font-size:14px;color:#4A5B73;border-top:1px solid var(--rule)}
.yl-cta+.yl-foot{border-top:0}
.yl-foot p{margin:0 0 4px}
.yl-foot strong{color:var(--navy);font-family:Montserrat,Arial,sans-serif}
.yl-foot a{color:#1F7F7D}
.yf-b{font-weight:bolder}
.yf-i{font-style:italic}
.yf-u{text-decoration:underline;text-underline-offset:.15em}
.yf-s{text-decoration:line-through;text-decoration-thickness:.08em}
.yf-u.yf-s{text-decoration:underline line-through}
.yf-font-heading{font-family:Montserrat,"Proxima Nova",Arial,sans-serif}
.yf-font-body{font-family:Inter,"Open Sans",Arial,sans-serif}
.yf-size-xs{font-size:.75em}
.yf-size-s{font-size:.875em}
.yf-size-l{font-size:1.25em}
.yf-size-xl{font-size:1.6em;line-height:1.2}
.yf-size-xxl{font-size:2em;line-height:1.15}
.yf-color-navy{color:#152B4A}
.yf-color-teal{color:#2AA4A2}
.yf-color-tealdark{color:#1F7F7D}
.yf-color-gray{color:#4A5B73}
.yf-color-white{color:#FFFFFF}
[class*="yf-hl-"]{padding:.05em .25em;border-radius:.2em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.yf-hl-teal{background:#D4EFEE}
.yf-hl-navytint{background:#E3E8EF}
.yf-hl-navy{background:#152B4A}
.yf-hl-teal2{background:#2AA4A2}
@media(max-width:600px){
  body{font-size:16px}
  .yl-top .yl-wrap{min-height:58px}
  .yl-brand{font-size:15px}
  .yl-brand img{width:34px;height:34px}
  .yl-hero{padding:30px 0 22px}
  .yl-pic img{border-radius:10px}
  .yl-copy{padding-top:26px;font-size:17px}
  .yl-cta{padding:36px 0}
  .yl-btn{display:block;padding:16px 20px}
}
@media(prefers-reduced-motion:reduce){.yl-btn{transition:none}.yl-btn:hover{transform:none}}
`;

/** CSP hashes of STYLE and GA_INLINE (checked by the test). */
export const STYLE_HASH = 'sha256-bwURiHBOrMoRmgWOHcMg23tVmbRC9ZSGScUSHD6EHTQ=';
export const GA_HASH = 'sha256-htk0LnJYNbXx6uainWbZdsaR7LAkj0WK2Zi5C5civkA=';

/** Same font loading as booth-proof.html. */
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Inter:wght@300;400;600;700&display=swap';

/** The site emblem (the brand-mark used in the site header, 38 px there), WebP. */
const EMBLEM = 'data:image/webp;base64,UklGRrA6AABXRUJQVlA4WAoAAAAQAAAAlQAAlQAAQUxQSPcaAAAB8Mb/t6o57f+911pn4sSVEBLcG1yCSylugSpuDW7BneLuUC8OdYPg+uFTgjuFWBNCgsczM7n2Wu8bc519zkw+cjciJgD/TxQR6XIi8j+WqJmpqghERFXNzEQ6Q0TNTFVVOqqqman8jyImqNtMalJD3WLyP4SaABi0w/hjzrnm5w/88W//+Ptf/nTfHdecc+z4744WAGJaRQsBgBGb7334xMtu+fUDv//zP/728P2/vPHcCQdsMwyAmC1/YgBWPvThT5x1zn7mgj16A1DNUQMgW5z11xlLWeOyKX84cQwAleVMgZEn//1bkoxwT5nuEew4/aETx6JcVIENjnvw323sGO4p14Md5z1z+qaAyXIkgj5nzybpyYN1hieSXPLwOiodFMA61ywiyeQRrDE8Ocm2i/oButwYMO5JclkKdmJ4agSX/AgKVejYS+eRjeTBTgxvkJN3Nthyouj/2zY2nJ3u5Nn9RRTY/p+LyBTs/HC2P7kGdLlQ7PYm6ex0D/7rCMAEa93VID3YNZ18fxeodDkx/NiZgp2eyEsKWAFcuZhMwa6byONh0tUM4xczsdPD+eUJQAsw4udkCnbpxEXjoV1Msdd8Ojvdyb+vBimAY6cxgl092HoutEspvruAzsqRUnKPcE/Jg3QuOtdQKFZ4iEysNTyl5E1Tikp0xm6wLqSy8QI68z15sKInPrYR0CI49C0mZ+VIyYNVPXkePb7ZE9qFcC8TsyOR5NwXf3/jGROOPva0y+59bPIC8k+9URTARaSzanhix0UfT/rdteecdsJxEy/7xWOfkmTyLCZOVpGuYnpaIyInEjn9+oO3H23I7LnmTt/rhgIY+wg9saJ7kAsm3XzELusORu5Kmx98w4dkipyIdDa0ixi2JIOZQS6cOBgdVa2pCjoaMGEegxXDSX50ydpormodVdGx/2lTyMggg6fAuoRixZciMdP57XnrAWaqgnIRNTOs+XsyMT8a5CeX7tMPKAozFUG5qFoBDD77M6asaNsC1gXEejzNxEzn/H0BE1RX4EdfMgXznWy9cDiAbgYoahQDtppPz2Dicy0qnVfgNCZmOj/fGYWiuhh6Hr6EifmR2P6PXYGiG4CVhsCkGiAFvvs+I4POibBOU6w9JzwjmPaGoUYVbDOZDOY7OXUPwApg2LlPz3pvD4jWACiGvkvPiFiyJayTRPu9QGd5eOtxKFCjQSbMZwTzExv3DIW2ACueMJMkG2cDWgdaML7Vo4zOZ/pCOsdwGxMzEy9GgeqqWPPPZGJ+kO/vBhSKoVd9RiYPJ5/aFCI1wHA0PYPOSSuodIZi+8UeGc4PB6pWU+DAmUzB/MT0p1WhBmz+GpmcJMM5dzdAaxDVp5gy2OD5sE5QbPcVg+Ues9aAoqoUWPFPwcT8cDYOBFQx9M9LmIKliW1/7AurBsVanzMywueNhdYm2vMtJmY2eCwMVQUY9d8MZ76Tb+0GVcG4N0hnbpBPj4RKJSj2X+JRRucr/VXqMpwSzszEf/RUqWIozv2UifnR4IJzVoACgmMWchnzI/HTIwGrBMM5TBl0XgOrSbH90ogM59RRUFRUDLifdOYH+dnOgAGA4LtzGZFFJvKW3tBKIkOm0zPCF24OrUV00L/pLI/07UYw5ItiuzfYcOYntt+4OkzQVLHS5WTKowdf2BkmFaAYO929jM5PNoTWUeBMNpiZeDsM+SI4bgmd+ZG4+EeAolyBia1MkcVITGcAUgGGo5mijM7XVWpQrPllREZw0jCVPAFOI535Tj69A0yRq4adXmZ4FpmYTuwtWkGs79+YE96+ObSSSI9n6Cx3zh0BQbah+330YH5i+xXdoaiq6HUtmfIYzkkCzYNgwOv0Mjr/ApEqhr3CmZl4BgzZgj53MoLZ7nx1Z8BQ3YCDpzNFFiPxjgGQPBjGLfYoYzQOglYR/JIpI/EXMMkyrP0mUzDbyZtWgAnqFMOwf5KRRSa+MVg1D4ZbmTKcL3YTyVMZ8R96mfOt/irIVXR/mQ1mR+LMCwFD3QUG3TOfKY8NXgirINr/OXpZ8Ns1RCvgGjrLk+8CQ65ixb+xwWwnHx4FNdQvwBYfsxFZ4e1nieZBsfqXESV0ng3LEoz4LDKcvxWVHAEeYWJ2YuOWnjADpDaIYK3HSc9hkBtA82C4nZ7zUR9IjuEgJpY63xoAQaZIvz+wwdxInLE3YIrhgEldgKG4qJ0ph4mPdlfJExnwKr2EzhNgeZdF1mVQZIrJP+nM41OjUSjwg9nX9wW0Niiwy6f0HDqPhubBcDAjSlK8CMlRPMsMLttNLEMME5iY66lx8wAUhhVPW0y++eMeMK0LYtjgYabIiZlri+aJ9H6dXhKcvxa0TDD8c3qJ88OekAzDQa0eOUFOBFSw/kekO/nSeoDVBRjwKD2DiVehAhQ3sFFC536wMsO+dJY2eDEM5Ya159CZ6fzmNFHT4sSZ9CDdOeuSsRCtCwUG3pZSlHm82wuSV8jhTGWJJ+QormAqiVi8Xo6g5/NMzHQu3A4iwMWks6mTreMBkZogwA1MZXSOhwGSoVh3ESPjZmgZ8Ci9JPEFCEpFBz5CZ2bEV/ujMFnxV56cpdEg79sSsJpgOugdelni0yoApAyizzJl/BlSIljhnazzYWUFzuEyZkb4XigE8iid2RFsu6sXVOuBYU+PMjLGAt03gJYZLs1wvtICKVvjS0bG/hmCkZ+4Z0TwCphq77vYiDwykY9vB5jUImr/pJc5z0Q3OWs/aMYB9IwpQ8sU23hZMMaViQ56lc7y8HQiTAQ3MLF6OP2R1QGtA4Z9cxJvRgs2WnwqrJliw1ZGs+DXa0ObGfZgzoL1oM0MpzIxs8HroRCsONu9BtLJr4/qDpUaFGu0M+chKFb4igdDS0bPoZct2SznJww2d84dU6JYa65HhvO5XipQbJ9YcyTy9T0Bk0oQe4KpxPlqD6BlMhcfDOsg6P9xjn8XVnZ01qcjm4naY3SWO2eMggKGfRk1kRFcdFFfQCoVuJqNkuC0gRBMCi7eDNak9/s53CvneHrGf4Y3U1zJxPLwtCcMHX5Kr41M5CdHd4NJBcP2LA9+vRYM97Odr4+GdujzQdY+OSfUIRg0NzzDeStUpMPFncJI5N8HAZqnGNPIWbYtCtzNhvO/BkIgGDQla/ecYxkZn45sorjUneXOB7orBIDiLqYcb6TIIz3xo5+NgEmOYOiXjGYk90ELbmaDiY+2qChW/5JR1r4NtOywrDmjOyi2WhxRFrFsHZhglXEw/CGvo1cgnXx9B0CzBszICH4fLbiRDbLB02CK9VsjY+GGOQeQ0Sz47VpN7K9MLHf+HKq24sv7oMDjeU/97L6FTFGBnth++SioZQz6LGs8WnBTh0hLDkKhxa+ZyuauBinbJWvZplAYNm6PKHO+1EvE8AuOhcoLGc5fKbDDx6RXIJ1cOBFQLRnVlsHYDS24rQOdn45AgVHTGE2c7/ctU2zRVkbnTjDRno/TWRqxaBuoYHzr4vUg3f+7LOhbo0Ux7PjZTF6BkchfbglYB8V3gqXBxZugwK+b0PmnAVCMm+He7FlBqWKVORkNjocpLmVieeLfISbrzeO3qwN936aXtW0kCgVGP0h65JFBLr1xMFQBwylsZMweBcXDTB3ofLybFjiCqUPi/ZASQZ+36SWJZ6IFo78IL4uYvz3UcAXjmzHAoH9nbQwFpIBdNYNMFchEfrQ1YChwwVJ6M+eUARBMKmHigSi03wf0JldBSyB4nKnE+TRasBMZGTwKqvj+4sQvRgHDplUDFBjws3a6V2Aktv1lXUCBTacwlbzUAnR/n97MffoaMKw5jd5hAqxMcWvWjL6CsYsy3N8u1GTl/zBxzkhgxIyc1o2aQRTY8QUyRR7p5MxDWmCCjf+LjSCZ+CAU/b9lNKNzUg8tcESz8TmGgzPCfXdor7fpJQ0eg0Lxa6bgrBHASrNy2jYuAUTQcsAM0iswEvn0ZjBDzyfZ7EZ0w5aNjHAehUJ7vUgPtm6UN25ZRDM2eAm64RdMzYLP9RHDyK8jgjOHAaM+zWndKANQYLVH59Ejj4zgwh8BBQY+2PCg8yz0wHF0lnvMWBOGcV+xwfe6QcogxQf0Eudb3RXbMJp4zB4NVdxGp3PGUGDU7JyleRADNn6eTBXIRL+jtxTAlUzB9rVgGDE9vIzOD1bVAnunxAthyFQ8x1QSXLwJtPdH9A6Jv4Iq1vkmgs7pnQSooffFSxlRgRG8FzDp+zyX8TWFKC5gI4PLeDkKxWS2bQbNMVyREzwY3TCxScQ3m4kpLqGzZOXPGPUBCmx2N5kij5F4+3AxDHqZyw6GQrTfQ/QM96krosBe/mQ3Qd6PMph4GQqs3kqSzougAnmu2bQhwOg5Oa01QBQ49SvS88jEp4AWjGuf3QMCCAa9Sy+j89eiit+dCquwaVuUOZ/rLtL9xUhM8VRPFcXY+Yx6ltYBqGKls75hI/KiwZt7qOGHV0AAwLBXpAx6OggmQ4YgX8ReZSoJLhuHFlzFROfeMCguZGKHqYOBVeZ2GmDA2JdIzyKdN8MELYKOovYYPSPxHxBBZcMF9BI6bxPD+l8xcXJvEaDHq/SuBTUMu3IaPS9S2gUmKFWs9rFHWcTCHaAiVRSrfsUoiViyDgxX0ReMhcCwawpmjOkSgAIj/s6KzmnDoWUw/IhexuCHg0VQVQR/YCqhcwJasM43PA8KGK5iyhk9p2tADHJKW2TR+c+eKmWiKzzOKGPiNdBKMJxCL0t8uVDFC18PFoWg+4f0ZlO6EqBomc7IonNfWBkEI6cxyiK+Ggyp4XvBTI+90IIfngYBBIOWMppNHQyMyWrtHKshxV+gUgbDcZ7DtCusEtDj6UgZfH+YKCDoMKqtbMogYMzcnKWdIQY7qy1YMRrHQTNEen4cXkLnQyZSyXAgvYyJF8JEAECxQVoeFFjxcVZ3frYytAyGS5nKyLZtYJWg9ihTmcd7K6ii2Tg2d37SZdSw4nUz6NWYeJFYhmiv5+llib+DVCtwYE5E/ABWslPGlK5iwCavkM5anka2YR9GmfPdPpAqqhj2ZXgJPT5aS6WDYdecwcCYOZ2milHnzGcjWGfEvLWhGSIDPg4vCS78jmgVQHE9M5j4e5g0+V7G1MHA6M4SBU74mnTW3OD1sAwobmcqofMsWJWxfUSGvE0vC5+/GRSAYsecIZ2nwMZ3kimYHxnBmX0hWZt8wyhJfLW3SI6g+4tbSoEfRpTR+V5faIctM6YNAVb+rDPE0G3iIkawYmJu8CBYBgT3MpVEcEdYjmGTdApaZOSc8DImXifWYWxiNJsxFBg1m16bAes9TiZWjOAyz0hxGYock/EeJUy8psqhnLMuCpzOnPC0KwyCMe3NgrOGAyNn1qaCYY98TQ9WTORt+zMyeAc0R9DrA3qJ86PekKzbyb+pSrdnGWV0vjIcIhi01EtmjwBGzKhLITu+RzorRoPfnIe+s+kZfwYkA4r7mEqCbZvAMgSvsZ0T0IKVvg4vo/PVvqqif2RqNnckMPiTegzY4C/BFKzo5KProEV+w0aJ881eeYWcwUYJnQfkKFabx0Y8b2q4kSmDiZdCFat/RG/y1cpA//fqEEW3E78knRUjce5tfWAFjqVnzBhUAT9hKkv8aY7hh/RwPwmmA1+jZ0TyK6xQjJ7G1GHeakDPyTmtTcSACe+SiRUjkU+uCSgUGwRLg9+sBc1RrL+QkXEFtExxeSQ6P19NCoxb4lHGCB4GK/CTVgaDS9aFFC8xlbVtJAoFel1ORrCik9+e2g0mgGBUK6Osdas8Qct79Izf5gCT6GTiXSgMd7CRQY//bIvCsOs8pmDbRlB5Nse3RTeFHfgGw1kxEpddsTagQIchn5eR/j1YDhQPMpU4J6Fc0OedDuGLt0Ihw6fRMxj8dhwKw2FLmdjYCoZJZXT+ToE1/kmmYEUnPzsUMEGzgbNyuFcFw1lZk7uVKdb5hkEyOH1zFFj34+QZdE7dBGbY+Gmm2B0FHsgg+dRFN82kOyt64oKJg2CK5oLh3+aknaEV9qZnTBsOLdsumjDx3W7agvHMovOLrVEYhr/MOAgtuCmvo7Oqk89vAijKFas7S4NLNq+0pTOaBb9eu8ywJ5uFpx/DtMdv6DlMnLo+CsOQ3/CnaMF59BxvpGBFd757/kAUgqzdmPPlGhUUa8/LWbhJzsEMNg3O2xUm9ic2cuicsz9UgfNORQuOYORUDycf6Q8osgvcyEaJc/pASIWRn9LLGjvByibQmzHxjZ4wrD2LnsPEhTtBFegHw36dksiPDlOYIFukz5tMGZN7VBAM/CSHe+ackuExfQjEsNZ/6Dl08lKYCqDYopVRVzgXntsHEFRUbMxgaeJDkCp93svaL+fkHE4dDIFh3CJGDoM8CVCBYsxsryuRb+4JGCobDomUcwsMFfq+n7VnzrGMjJkjoIBh3yXhOYxo+81wFBD0fJvLog4PLj6hB1RQWaTbS8w6C0WeYviMnLRzzg8ZUTZ3TAcYDiU9p+OkUVBRHP0Z6dUS+eSmgKJGw8l0lgbTd6BV1viaUbZ0C2jZTsGSYOvGMAAoMCHRsyJxzgWACQZfnZg8z4Ov7AmYoEbD2AURZYkPQ5Fv2M6DZV+uUaYYu6iMzl2aocCPltJzSCdv6A0xYIfJpGeEk78fDFHUqSj+wsTySDvBKh3OVOKcMhTSTDDwQ3pJ4hnSDIYffMOURW/wqS2AFkP/U6ew4U0ikf/cGTDUWmDF++gsT/5ygaqKX2W9WJQBeCrrvyHNYNhhIRtZpLP9nj5AAaw+mfQgnfSTDRDUKYY+L9GZ2eB5sAqCHh/RSxIfgqDUcBlTSUTrpmLNYNj1E6Y8Ovne0d1QtKDPQf8iG855t48DDLUqsNfbTMwMvjxcpEKB7zWcGZdCc3ZnRDM2eAPKYBjxHD2PkcjH1gcM6Hd5O/n+9oAKalXYOcvozAyftxEUlc7gspxDYWWCgTPpJcFZK0FKYBj0GybPIj3xy0tWQtEC7HDfmQNhhlpVscnjpDM3cSIMVQV/o5dE+E45UExiKmHwELEyKHA16Xmkk9P2AAoFAEW9Bpw6nx7MTZw9ULSKYsMljBLnrP6QDJPzIiPxF9AMqBR3fM5UgZG49LyRkEJVUKsYhl1GJmY7Z20LRUXR4n46SxN/A0UOdmYGo3U3WAYEWP01euSRTs45ClBBrQYcPIsMZjvbxsFQ1XAcnaURS7+TJ+j7Fr3M+e4glQxIgVV+RaYKjAb5u9GA1qHoc8YSNoLZzlmHwFBVtPd7OYkPqiBb8X1GGROvQEsOoMDR8+meR3pw5s39UEgVNez0GunMT1yyMQyVDdfQWR7t46B5Ir3fDC8LX7AlLAtq2Pgl0iOPdPL5tQDNM2BiOz2YHYmLT0aByoYDkkdZio8HQPJgOIsZdM7cTCQLUHQ7+BPSKzAS5106GKZlYtjoHjIxP4JvbAJFZZXBM+ksd14CRUXF+vMjypj4NETyoMCaT7QxVSAT+cFugDYzYIev6MF8J/88CobKIriTznLnlBGQKlCcRM9gaj8FWgFikO3eZkoVGA0uvWEdSIcCo+5ayAbzo8ElRwGKyqJyuTvLw/1wKCqL2r/oGcHGPtAKgAqG/o5k5JGNRfxqUygU2OZ9Mpgf5LubQBXVDdswIsM5b4DUAMO2yxpRxsR3VhCtAhhw1KRgyov29i9uGgE1FEcuZQrmN/j1ravBUKPIgKeZWB5p2ekQ1Kl4mCmDifdBpRJEgNPb6ZER5OdbAgJ852XSmR/OL7cGFDWKtfyTzkzntVDUKjLieXoGnWeqVgMM2OoPZIpmiYvvGgsr0OMHU+jB/ETeuTZMUafhJ3RmOl9aQaUeGDZsj8iI8G1gNUAUOOQz0kl6cOlBgBkGPEYm5odz8fGAoVbF+nMiMiLSTlDUrXoTUwYTJ/WA1ACoYt1nW5k8kS9tiqIAtvuAHsx3cvLGMEWtogNepDPT42woahfBjUwZDP6pm0kdgAI7vk/y7R90hxUYelMbEysmLj6uDwz1iuG3bDCzwb9CpT6I9HibKYPOg1DUAwWG3fzve0YALcDqb5DOfA++dxCgqNmw+zKPDOesDaHoTMXmCxg5Pmc7WD2AAQOAFsPg22czBfMTeUlvqKDmAjt/y2C5x4wNIOhcxWHtHmUMzloXVhNEoQZs/jLpzI/gtOMAQ92K3i8zsTycB6NAJ0uB37CRwcQP1kCh9cAKYN37ncmZn8h7R0ALk3qkwPrP0ZnpvMcMna6yxpf0DDqnbAqYVBMToNeFX5PO/EhsPxkoAMC0mhiwylQ6Mz0+HgrtPAjGfeaRwcRZx40GzFSkiYiaGYDNznmFTKzo5KM7QgrIvvv2BNRMRZqIqBrQa8L7TMyMxH1h6IoFDmfKoZOzftSCjtpR0LHHfi+2kx6s6PR7ADXIdeS/L1oJTVVNVQCg2O8lMpjrvBOKLinW/T56DiORr11wwGYD0bz32rsddcs7JJOzYjif3EHQItj2cYaTc/5y4fhNhgma9l9v7wteJN2Z67yrp0rXgKDvG0w5pDtJ//CJe6675Irf/OO1RSQZHqyayF/3gxhw4gJ60BNJNqY/+dvrLr787j+/v5RkOLOdH68ARVc17JXCs8iUnLnuyVnZE789G2gxDPs1mdjRU3LmekrMd1/6Exi6ruFYMvI6ekrJPSUP1pnIR8ZACuCYWYxgZnhKyT0lD1YN8vswdGXFMW2MSp0azk/OL2DA4DOCzq4ZbL0Iii4thqNSpC4TDfKplQAV3eNj0tk1ExccAJWuBTEcRaauEYn89vTuMBGsOYVM0SUi0Y+Foesrdn+L9M7zRC792ZqAAkCx+jlTyPDoNCff3B4mywEUA+5pZ4rOiUR+M2lnwASlw+6aSYZ3TiS2PjoGiuXTINs8TzY8aopIDXLuuesApiiVAhh58PNkNDxqCm+Qr+ygMCyvAvS97FuSyaNSeCLJL25fDYAiWwRo+clrJOkeUSXcSfpl/QDBcqzAmme/2CAZ4ancI0jGrHsnjAZMBVXFgG57XvvyIpIM91TqTpLtk8/fGjDBci0GYNx5/1rMqkveuGGXPgBMUasYAKx/ylNzEivOe+2aTQGoYLlXE6DHxuOPOf+me/70j8cf+8t9N5x7+H6b9QCgpqhdTAHoKjsfPPHqu+/5w9/+eP/vbr/s+P026AXADP8zqqFONUFnq6FOVfwPKmpmqiKAqJqZCrqkqJqpqkBEVc1U8D+yiGC5FBH8vxAAVlA4IJIfAADQZgCdASqWAJYAPikQhkIhoQrlA5YMAUJbADReCtBD7d5ndT/sv9l/Uv5MfLLrC65857yn+G/333OfP//F+or9YewF+s3/D6hH7i/ir8C/6J/j/+l/ffd6/4P7ge6j+v/7/9m/9H8gH8s/x/rL/9P2EP7D/tv/P7gn8o/v3q5f9T9x/ga/qX+7/9v+z/f/6Bv5v/fP/b7AHoAf9r2H/4B++Hc7f1/0aeJ/4L8rv3O8zX0P+D/JT+0f9L39P7fzCdKf8ryTfeb9r/gfSLvX+P+oL+O/zD/U/2bfqdh/yv/Q9QX2G+e/7v++/vD/mfSI/wPRH7BewB/MP6T/s/7Z+7Xw5/qv9l4mH1f/Qf9L8gPoC/jP9G/1P+I/eT/E/TJ/Tf9L/Kf4r/uf672j/nf+P/63+e/JP7Av49/Pf9L/eP8z/6v8d////h9zHrq/Zb2Gv06+9R3oOE/nRLLZka0BfrdzFanFIKXXVmKuGESvfoRhCwWBTWXETl87BlEyf+Q6OhuggDDKFmAKcyf15GEx8wIZ3AGFQqdQnx4ygY9Y50g0f05dj/wgsg5IpzR3sXv4uK2MHOuJaIhd1fF/OSz6MRMIfXzCYVDiqgQ5u5M7ylnq4DTvnJfUUX2eoOL2Wt1/H2U4tbT43MUcykTPFsR/PmeNNGctwlpSbUWIS2aqziu6JUzpDpcSqVIXJl0ZV+vxafDSMcuVgHftRUNxU2XkCQ1xT3CUOFj5Fkg7H1eIwkLIFnl41f+3SptOQ3lx5GnQJOBt2kMcVuEmxDc84FkD9NDv+7ZcAAPiJ2HcgFQs/vMxSjGM/njxgB/VnP4yLw+og60DSaNkPXNlsJ1U7RGxv/ZQf+jHnDPZ5XVcLzS6ZBtkSv8pMARCUJmckho42TfqSPkav+UFVrUWXReQL/+UL8TZ6S13OLtYqN7gQ/vXKr19Sjw3kmBQzZ3sQZzkGs8DvYjUWVXsPqlXKaWf/s15ZFmj09dgQho6sAY003Zzwv82t892xfCcoI+YI2J+vJZJ7SFBVPB2zrnSizx3GSt1z3+icVtCbEfS/lBn7RIttozUZfpJ/xkLXCh3Qw4e6mH7JiGA4D2E2d3imX7iS/5J5AAA/v+rUjwpbxG3BqrfS5x/7fFUYMrg8UI8Fw8ZcFVmEBGniD8TKIXBFrtYi8amODVg8x1iLEzA1X+vldjnTPvegWY4sBprxW32JxXFpyc62jsys6WzR7fsw8dvwjYf448A16cVN6z8Ut2iwerx6D14bp6Wbdq2jXXY2hSQ3UkeXoWJAPrN/rStbQqeXc2HTsbDtkRI8VAxp+SWDAX1Rz+lSGtLr9XlzpYx7p5D8AeAFAOh7QXlnvOYuy3O9S42U8khuzmyQ7HhZalv6I6U9AhFUI3KYaNkGtWVFL0zju3oJ5J/PlxgTKvz0d7BLBUPzL2FIUYfCIWdRdy6juX7/NtBwxXwDMD4lc9hW8qB392XkeyvVTmIMeoy5zymfR8YmJXfJlWfOioRhc4KV7+CQXIZMJVh10kaxg8tsQ9HumwcN6ihlqay58lToncA4UGQ5lkxG0w6INYcSYojIPS/fEDL2ZWGbPDAvVp2+dpKiBypCeSKDkl219/3EQU/KIUraJNT2wLU5IlFkww6E+q6/p9wHDI4IuxoXl+Y6kj2ue6eGKP8uz+8Q7eDs6UIjV7iNhy+PGnU9djaYg84ma5+E/WXKNugFYMezCFlSzVfE0s+mS/0PzBRiD5YQWyLYtCMVG64DjWwiSU+QsELU4/FJJDJ+US67H2QbVcjsHWoeax7EiKEO0S8UIfVYAGfoKmPvZ44u4oBgom3WNDAE+1H/97YejIln78A8YCKHXdXDL4EatIBdngS3+c/EnHhiEAAH52P+cVTyiq+Fc2ef6L46TLxxO/t0vRVU7yOtAH9lnwOTymiiorjV3spjvICJl4/MxhCFR1hzv+xPx+xiKjExerO1V6WXx9/fFWpGW2SVrjd//xzSZ8QofhNbGPpG94yuA4s5yvXZPhhirXjNgcr140oODAkFQVngmuBZzuUe7Hj9n9TsZB1fkOXIRFtnCEFYjnQ/h/BArNFOP81DZZ3+06wRRf0IyK8doVsBiu42G3ZXxp0Owh3gAQmitiPkww1gG0KP3aqgPsO2022kt2i5T3iTth7FWyOiBCWx9fuZwsbBKe1yMIS2pyx165q4cLAztVGslW5/Xb2MutCT2uPqCuebivYCs0FBqyrqJvecTcH19X6Sh0nTl8Jr3MrbIVkUPp7t96OlXXgz96jsiDsmK2Dz3rNnh/FshQ6kzY4RjrUe0tw0hvjjSZOmFEFpIeGQ+hrbSrNfkYPdsUCw68po2SHd/yxlhyiaG/9p81Y2ZIYswP6klYeL74OM3B9U149Qg0BA4UCKBP38jsoAXZnb9TiKomncNNMZ9c1TAXIJPTtJ/Oep5yJuN6IRx9q7l9bZlE/ZIEX9cW9KR3SnNBlh2JODtTGoWisIyQQIxuCX0wceieQ4P1F0N7eUxWCIGAJBqUEtlls55ywk//P49tCSL5uFQ3M/RdRyWMKYPN61UwyTJg6mfF2vaIEmpT3rBgtffzZog/jlmrZ/vrb8t89FD20lZb/pSAaWCJ05vo+AUB7Gh9qMGl9Nvmuekp9Qrlr0R+B6Mh2b/3sxcpDKa93vNV06yTalrVRErtipR1RVqaEjeEaavdCa8+oAiI5BJ7EgEBxNU7n02GCwPK6qUjkJId+XVkGUllnhxHeY1/KDj5Qdx4Bg5NXrHFAOLrwe5QXzjdz8GMBZgy1e333YM88LhjB8w1+my7BlUcrV8mvWCRLHSG+veeJHjeu4mnUXlf3iQymVwctufumBgcGBwO/VaRFYXrR2MCTqCWZmyc1n9+jvwJOHmpE7PmJHprz2LxZxvgbDi4duXC1WaahKGjKaUZuYZ5UguU9X44lsua3RfPTNqKEZ9VEI6a6lP+6Rssy6ctHs5dVMewMeB4t50+ooMolPDx8Od4dNs2MA2lsj1gnNnm8ggAVqxOG2H5lUFFMjCwLls4ALHEF3lMu6oENsPIh5FrcJ5UNFpYdmjIkooVOixSHrdssz3SvBVphImVdVwDjyVOnBaV7NWjSnssXGaiNzXpV+bOALuQMajcmQYeNmvRQAhC4gwio/2eNwfl+hniBBGenxh5qqhqswyTG03UYV5OJY0Or3SKu6FbCdj6kfm17DK2+iN8nQIJuIl1VztmMniAJz+bWskXOa4/TnrUB89SF/aVhyqrjoCLT0wNOxuMzSu1ur/D8MfO/WkNOeSq57T9n7QlTtbM2FQ8u+nNlOxYwjOKZk2wMWmq96ovSlJRRRuKzQu+A7UkRnho9F3HoJ4wqZzOpBwfqnBN6XW+J+ekiFwAKTAJkfZGXDskFy4R8FgxDtjd2H2KmKVceoV7BsLGJS0DdLEAHlBaEaB8N3EsizpMbx3qBNlhx30CiNQ+nIM/YfLeGlNkPmGEiSzv1fgil9twYIq2+GrXFhSdIBOLATseR+pmpPZfbBtDpVJxLtOgQM2/EE0WjkzlOMrHDu3GKodubgXhQziDFR3Y4YAHGYgyM30zq3crwZZVwOXJPhghNjRI2HoWdblygJ+ERsr4ium/dSGoSbMlo+c8vBnscCFjvvBJyFc8gdoLyxjulxF4kFwK3AYPYP9qKlmgwQbMJYLpRm4W+TI3YuqTmQsGSdylc/C5JjhpKAwhofP/UV9GaRa4XlfK1EZlksZav7bYc+iRgMgE6hpCN7oprHFZ4cGCzhz9DsQgmW4T56lONeIjmYeMzmfqCDHA5aWpGY4xNcfy6QV21X1owKgFpISyD97wmFR7+qc+ZVYNlAEqkMJYNqjzv4xPW5YpD7QXd86rmnZ1v5ZbUpE6+zpKjh59SPTA8xU2hOEc7ZGagG96XVKCjWhExn3B6JfXQXsVuqPDuGD6FS5yTg2m/PlIA82bctxZJhyuA6/TAbpZwFEou4eWPiXv1IKhA802d7mItb3OAy7TCRutUhY0lP5C1W4P0Hzf9+Kw3uDEg12+ZMjkad+y34a+j4YbFk/9+NPgVbEpzOSEd7z1NPByGhFNCOgFBGfOznUTf3utfsTRP8Bj176kovMgHgIoQiXSlw4ME9i1QMtX2NdASW5PFAc4An3utishtB9hon9sq72j7VcbQK1+kEk6XZ3cBBxK4rm2usn3ShgECGRNfPGxA1o6yyMatGKJCgPKdUz7s2CbJXMHpIrNSsDZh2wVDFiJHo/iEe5sIeLKOPPf0GsRVDzYgUnO+SNAIKNvXbFxCtdaUMGi3DdLr4CM6plPESjmy6MYVlBaVSPjw7RwHy04HkuvbOuy5beWfHD4bXbauXc2L2FzgE8Ms1zXaar3D48ZeH0H4iAl4WtcomitzgNKyI13oSfSRlxyynAHh7FSmfWk/8Bjs+Clmtd280/z7HNbOnOFVRXPM7FaaPnJYffFP4vlQEfc5T6a2FbkqwjrwA3K1lsjSR+h308VaNM8EAOJN1aCgYX34NApVqYJB3qO8KVsrngZRLQzzsX3BlYwOEWGhOdcHcAkNM1gJHOJbzzDZJoH9vUoX22dwUBntnN0BiTtD/pZ6JqU38mHR/8/3iCyN4RNWlKqqp4n+5ZLNIfc6oAyI6p2zKbBytw9AS48rtZUtj6CWKJXJMOTcdSIDZym5jQz49b268JQi0kdMs4ZltZFZQv4MlY8DccxfFzJqeD6kGYDTQJBv7iHo2w1nIV2N2LpKsRHfbHcGBjU5t/6Znp4fg3igChlE+pAEWJuJfLaJqNa0rjuevgFVukgSjarl8wxeEQOaanaifAMcxWxonc0jXhH3VCkwNE/Te1g5C9y8gyA+nIC5cMrkzThzyqBkHbY8vxzWY0xXY5YsU3hcIprDDacA1G6UsQF11m1dFXkGiolpt3hkaXYRYxme/73mDVi+shWXJQdFN7OoWMWdCyQp3WUmawXJpuCRygX4+wBjzEdagbEwAcb9CmZdAeVK1h0YvrvcTA0zsIiizCInUPxLQsWGdjgm9shksfDYT4MMrw82ZSUek3BWfUNKDUyPW64/sLnef5QYQ8qCtLzPog3Wvs64/GOlSslRmUep+KqKlvkWF1bUr7ugISLDb8PudbKATOQ0X0rVfJ/wVGyfglcL5Rey7tKtHIqUFlbtoLGTzregqX8aEEWbKspwN378hVLlrqtWw4V10i2QeARHdgIpF7olB+kIDASFegPMn8T+9hwDrJZya51aC9raJMeQacLDjF501FGG4GYTZXVY6CVAfpw75rj//o2MbLyQ22sMw7ytDb1QGniiHvK2gbLUt0WIy6jW28j5mOu3mqSMe12+UVXUmUxToTOZjAV+BfeWavUEZgCITdydrejyc9wII90dzEJgLtwCjTmh7jM5GUGl+aIFpdkDTJtUPxQAOvnsY2V5VoMv7AfOAvwCBkW+qTjfka0+XqG2uBje/fKK2gr3KRdf9W9eNdK5pTh4cuS4H/7FWDi3kS/lfT5muuIhE0ODq4BB2e9LubqFdA7vVc1FftbJYo7QOODeY725nIpoiGLR3bz4anTjTge6KBoZXx5VzUKC9+GlPaCg22m+XBEdC5hSQSnAd1pNqtnoDwEDH4Qe7RNVJyYx8W9zuzs8Sxg5qXt/ecdmEZVdv6f17s7QagM7VABXJpThTA0+YMx06j9WznV3tB/945SktWPNBERxkNyI4waQK/H9zqB1sxYsYRv1tFk3ipDqWcTnZy40wRA1Q+SkILjlzZiF8FXd3h5yeipd15MUWgi2fG7w9kvcaczCwQu1b5Qd2BpF7LBzyTiltoqMbBNevHg2GlSekAywnAadSKIsSiBAiOxh9IlPBC2o5Cwz/SJU64bLlXLSTKcfQJ11UtDdBT2hAazONa3g7ZbDTz/qxO438NN8auM+dy3fnW78YqrLf54UhBRbXOQQ+dZZcWgoTDyuS8/CMtiqIFC+luLgie7HbHQn8N8y2V41dWyuFBH0JWUo258Piya4FQUIN+5ZH7natl13AfW22WmNjYiiKmSWdRMtcLMHFUwsdFlwlq7Io5je5QUvYyv6PrHtiUfhjLL4jMUkDP/jryHC4hPhxPoDKmXMO9BLH4KZxnE1BKK2jFdqSJ8WvM7kJKrL2YK59YTlTydkXo9OPUKxgwFC33zlU0lc99uF1Bm9144+Q6A0u0Uq256oL/TMwDXEWMvz8hiOQnlhz4IboNZkU/a2ZELPjQTGE/cEen8TSxhsKBk3A5pcKFG2Ii0xJo9DlHXtuXU8hLHutUXwtsIzPLkcJtdKwXct0Bv9DZ/p7/c3/spFK1vWHq2DhMyfAJUj+zg4CThRVtLjZkC50H4H/jAsDbxX8HzWxTZV+lSvEpSoUMepKhk0suCI/Qo8qNqksSlHg//M0ys+yV/V/n1CkT01mDBSGZp4phGqkm4C1if2oLg2nR8h5w/M4FotM0gptlnYETEYFhoFP0lNMTrb63TdfC8Kjw10JuLj5WzbnIoHi3wOJvR20oQ7yt3derBWpPHOiWYRHFASW4sGirhx9BGnaNDnzE/g2LRTb9NSbgNYgO7ODC4RspTkodR3Z1CpkSgBXYxbQ/FUdtRdTJ2AnltWRAAaEdm2yJfKmy9Qf1RBr86GqY+3xR9B9Nk9nzgDxLbO6CFQp2bn0sfr77x9X1059aPVtdsoC6NNBrbK1/xs58jOzQv6HCNWEba6zhw+SLbGdilUREhqT2oAfRysgH2VlHTXkrxCLhQWwR03R45InDlAE1i6VVniZviZ4ExOnWASYQhDYmgJrJBZN+SKiXSProb9cK1kk2dsM0W6muQ5coXcO+FfvF/eXllh1ormFLTPBX6OIRlsolqP/a2N7onhJqwrVnf+oiu6qKXfAWCR2dOgAVFr1UahpEfvJPniwEu4ZkuIZH1Eohyq/4ZquxumpZqaxYMLQbFwCNhhK2Z4Zwi7Qewjf8dHlG2jZatqqqKwOsTwRaFjLImIJJrvxHf4zqPQcGtCkl67/TJLfCCAAJiw6xeh6+89eDQZaQP+TbrMj2flG8UCgznANTzb86u87xIkpyc6SbVAxlQQR8jb216AhBHM7c5DYZiM5JEP/j02f+Fny6548FLC1xKOwcdx2sZckeE4PXjjkpgsnlVhtVKARHeU8Ea+reFjrP+9Zondanmldr/C+vYchYGVgXyTvRvx2hr5bmtvghIqGFZV6u+WoahVAjL8l8EnopgMONpPo/fLPRQxXE5EFofVHOzD+bJKMKwajpmkuO5r98BuZzAseSIc4/ZJBW5JwP4twXbRtdG6nQO0VAbx0hU+3bxiSYTt5rhwcpletpkGUG2sSJEkvCpkBUpTnyPdcHoPFLqfookhOKjBYU3zypyZ5v1A4i/Fj+vKDgLRhqia1gL6fUz4Hv5JbS/oukUPajVQP4PYON69wsblCy3ZuQckyGFvYUiEvm/lL9zHwwUaaPEIpbCUMdk+uDV7bd3voGyYsNbPEpKttCrDmLlfbXDdKoOxaFnj6pC+vPE3KJEXz+7/Z4KxBiStbrNoTSR/8X/TjW0Ru2Aj0+9akt/MzGiJKiK5eucyFELspODnAi9SkpwpxDgGVCBjrZGN+fryvnVDY4RF/Gq9xBDWLYiLG7Zo6ata3AsI99F56VQAB4iwbpfLKkbnCrETdkpY5dDC35GHTqvBSdTrSGEaPbZXFcHO4ENLAX/Wl7EoqG07bPWc+3TzLw7b0ZNq9jXEPCxDfu44XDUgkECgnyow2vBnz6F+RKP31Qr9F3JLHp0C3rMtCb/M2OBaDoRvv64PJRi7sxirs7GFZd4aVVvY6NiVunsX+mjH6jI0UlOvdQC+y9lYrK2ZHycA7JoTy9Q6bLBwNQSzC6bQ9gm3mCEecFUch0+NdMaoEFZNihh65Mhsa/5c7eNZO8LeB2dBbgWfo+gMaXfhTlY9Ndiy803lmZEWTpefkAMHs83WWsPRJUOYxSVSAR60eAbtAEQBM4DPNw7MTmYSMJJ6y1jooeL5YxAaHmqMMgbWQNgr+GMr4JOpKZ7Fp6jw0xPSZd/8YhR+XUpE2RSe8xjfllgK8ppvQVcyzgRDW7MfjhU65Z5YdYIVvkq4iV3s4J73U846aAi5qqukoiA1+kaEXENjJlLhOa73PJHElMYqmla0MtaeNUy6wzEg31mFw0nLblMnt7gDiSaxlsQDxVzLixJdg2AB5MLz6os6JLeDMAWLbi8G8N1fKXRWQDj8LYO3XO/Hbhuldwj/SByNe5BziocXUFAe4l87jWQGMOVLqeyNrJ6Ee00EbHugeT3ODfI8VePZaXujGqc+xAZbUqQpJMd51C6+yget5bn0V/Yw1vcnROe+ks++rZ5cKfopN1SJmC3y6dzkq1pSYZ83i0oJl+fVcSHwfqV4wBzqR5LK94AlgWne51TUSgwsTd/ajgj+RmUIVr+72GlFGTI+Ayjo6X+F85dZ3DLqMLVJwpU5SMY7n/9mU/Gts2693GvqsMglYpEE1APXNhpk87lbxkhkUbdglGnKg3X+aChQdSuWZubsng1qi4rKLeW1yf7snVOdQy+auZG7yTjHJ/oezJRQNdOhmoQDw4+69UXxx4z6uxJrZZTp18+vNxOL74pS6kpPtQD6UxIK9ZDIFU4w64YjWOLI7nH74kDhEJLkMAYxnqt9fRooxVfsozZNoagIxFa/kuyHQ+D0ymhewmvn5AgdCg+DnGNEl54jx3Fi17+ZXW4sHYcBxmOqTpOPYcTXQdwANvKYVz1+s9zxgJuYns4+sGThThEU08qtZ0s9KjVf2f6ZkTZclJuL9ByqbTV4idppyHcd6BEv/PXP4Rai4Dfw0j+GX2Lcg/FmlcloRyY9EbI+tjTEAdxvnTU1DrHDKMO3a3NNW7QZZUBjpi7fkVJWdlc3wMZFz98ShSuLUCGC+bH3+NyVWITmlLWwucry9N+UKyeMPsutQZVu8fvvyjNyUq9jGxtaXUWdfaDcOdu/mMNIqIIMMhZQVK8pyCRCeq7mPOZ2AzGchAw3pwwMnzFm0gIxN2+4bHOBnbF38DgCneelOikZucGej5xX5UGq7iM9JQb5F6Qc5bBgM/NhOtdIvlI+jLOSUpehobOlYamEoOSPBzu/85BCKqH8HsvHMbBVANdVz5M1JVUtXr9yDlrPdrrRqbRm/4MbfpViTcQ9f/00JLF9AwFQP+tjEj73WkdKwdvMKjOdIX0TJXrfb0KI5ZKrbrh2MIs2ksY0m3DrG347X7DI1GrlLOw4q3cbwo+saJ7gepNzQGtt5Pb5fYAEeUORK0T/9WNRiz82/Pw9Ugkep31e7jxiQzz1Fh1mzU4oOApfuOuOUm27PCA6R7gaOrcB1ADYdzZffu1RmMNcp8aZe+xZA61+WbwKab12qLkTwk4PvyXN1zf5dyqhRMFjkUnG+7ELvs+8J/0kO6YahmBl/x7twtAx2vFWvE0HTFoUWcNPIsNq4DkzqRq919TsYyATb2AhArzRJL6VSDMTub7/3/DNgGRvOjxHoq7YsqI6uvuygQDDFPuTv/qqLyM/ZquzK2QIflat17sSml72VHwzWl4FacDCQm63ULqODnzCGwGXLY0Algh69fUFq0I8Qik1DB+cEFAAGEru3bPJsNJqIZO8DIp8LD6dyi6+5oB9W/poB5xyaDoobSPhoVzVBnX6qB4smbOG82IENbC77dISnVKlUcyyEkArC44bpp1bz0a9ucxE4N45sHw4otjv11MlD2L9bVce7JQHow2EQv/HcDi+5VWjUfeTBZIolJQZn21xZwfSSNsv34MtBamdLRBRMLnVb0S7n/rprTq4yGWXluxu2p2FC2Jl4JtW8IAJzyRxSs7DbMAPD0whVlIMKEHxhYqwDXzLNQddvc8jpyP+T6Wbp+ob34QSVBbyRdJsi9MzIfouDhvxc9pDGVjnfs9hMusuHZuiZeHykVsB2EhE95Lf0/nNyRkoXRov0gYjYoIIOSjkDRRUOR77xjl1inTKu+Se4zv5oh1GUKkHmfceULbE5JedO71aF8OBe86pIWHcyymqrJ0C0R9vml7agQC1eWosrhDmmyG/MIRaZhwQmfnYW5aw3jkPWE8b3mj+neKD+/Jktz8O/eL2zO+erhvPPj9pAUEsVQAdfes8Y0APlA/j/X0tryRl3h3E6nkK20fqJ3jH0iNtnD1yzZvRvSi99lhdQBbAwMfDSNM6yzHzybfDH6UELOwUR1urZks+oMT7fbizvITjDAH5Mn1pHwJNKP0LEOa/q/ywvGgNqppYP6oSVqB6zLJH0rOVmd+/uP2MKqgMMRdcrbzV94t0VTnjmEjdUkfC6guKlzG+8BnrViReRLZd86rTdwvp3iAAAAAI1FqiTwUMz17oJKQrNDWxB9tYhbX9OiA/a+u8EJ+PYXk6TTI1jX0IMdDOTOfRGTKuC4GhF+ap+vpsHBlkHRkahTHlnNu22C7RW81Vuu4wvom+PoBJwPjkxcZlf8AP/GURM7L4CsVANwjtzy2kmCp+ddJrVMLIpR3ZoO7+qhpdWtCAecknfkrVh1/Pk7RJ+IE2naID9VjuT5YB6rnYp1L7286VtY/5Zi5cG6emG8J7XNYc1/5YIAkiSxd7znXfQ+T7qb8q9vCv/vBdmvx7NmTiratHdxuS9ho3enKKDQyUCwnH3XX+AdhHQxj3GGFY8WJxO/uk872xsvuGBRLECCWJHNrXWKUkQNDvc9JS/P7Dkw9Rk2skY9k/7s6G/j6fyTLeAK0jdvYE4i2XQVaMEaCbg4Qc1bBVe+O8H36MxrRE//AkYAAAAAA=';

export const CSP = [
  "default-src 'none'",
  `script-src 'self' '${GA_HASH}' https://*.googletagmanager.com`,
  `style-src 'self' '${STYLE_HASH}' https://fonts.googleapis.com`,
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "object-src 'none'"
].join('; ');

/* ---------- small pure helpers ---------- */

/** Escapes text for HTML text and quoted attributes. Non-strings become "". */
export function esc(value) {
  const s = typeof value === 'string' ? value : (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const UNSAFE_URL_CHARS = /[\s<>"'\\`\u0000-\u001f\u007f]/;

/**
 * Call to action address, re-checked at render (defence in depth; the save
 * already checked it with cleanCtaUrl). https:// or a same-site path only.
 * Returns the address, or null.
 */
export function safeCtaUrl(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s.length > 500 || UNSAFE_URL_CHARS.test(s)) return null;
  if (s.startsWith('/')) return s.startsWith('//') ? null : s;
  if (!/^https:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname ? s : null;
  } catch { return null; }
}

/** Preview picture address (admin only): blob:, data:image (jpeg/png/webp) or a same-site path. */
function safeImageSrc(input) {
  if (typeof input !== 'string' || !input) return null;
  if (/^blob:https?:\/\/[^\s"'<>\\]+$/i.test(input)) return input;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(input)) return input;
  if (input.startsWith('/') && !input.startsWith('//') && !UNSAFE_URL_CHARS.test(input)) return input;
  return null;
}

const posInt = (n) => (Number.isInteger(n) && n > 0 && n <= 100000 ? n : null);

/** One line of formatted text as escaped HTML (eyebrow, headline). */
function inlineHtml(markup) {
  return runsHtml(parseMarkup(String(typeof markup === 'string' ? markup : '').replace(/\n+/g, ' ')));
}

function runsHtml(runs) {
  let out = '';
  for (const r of runs) {
    const cls = classesFor(r.st);
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      if (i) out += '<br>';
      if (!part) return;
      out += cls.length ? `<span class="${esc(cls.join(' '))}">${esc(part)}</span>` : esc(part);
    });
  }
  return out;
}

/** Body copy as escaped paragraphs and lists. */
function blocksHtml(markup) {
  let out = '';
  for (const b of toBlocks(typeof markup === 'string' ? markup : '')) {
    if (b.type === 'p') out += `<p>${b.lines.map(runsHtml).join('<br>')}</p>\n`;
    else out += `<ul>\n${b.items.map((item) => `<li>${runsHtml(item)}</li>`).join('\n')}\n</ul>\n`;
  }
  return out;
}

function plain(markup, max) {
  const s = plainFromMarkup(typeof markup === 'string' ? markup : '').replace(/\s+/g, ' ').trim();
  if (!max || s.length <= max) return s;
  return s.slice(0, max - 3).replace(/\s+\S*$/, '') + '...';
}

function safeOrigin(o) {
  return typeof o === 'string' && /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(o) ? o : SITE.origin;
}

/* ---------- the renderer ---------- */

/**
 * @param {object} landing  a stored landing record (LANDING_KEYS)
 * @param {object} [opts]
 * @param {string} [opts.state]      landingState(): running, expired, archived, before, draft
 * @param {boolean} [opts.isPreview] a draft seen with its preview key, or the admin preview:
 *                                   no analytics, Cache-Control no-store, a "Draft preview" note on drafts
 * @param {string} [opts.imageSrc]   admin preview only: address of a picture not saved yet
 * @param {string} [opts.origin]     https origin for the share tags (default https://youravdept.com)
 * @returns {{ html: string, headers: Record<string,string> }}
 */
export function renderLanding(landing, opts = {}) {
  const l = landing && typeof landing === 'object' ? landing : {};
  const state = typeof opts.state === 'string' ? opts.state : 'running';
  const isPreview = opts.isPreview === true;
  const expired = EXPIRED_STATES.includes(state);
  const origin = safeOrigin(opts.origin);

  const headlinePlain = plain(l.headline, 0) || plain(l.name, 0) || SITE.name;
  const description = plain(l.body, 155);
  const pageUrl = isValidSlug(l.slug) ? origin + landingPath(l.slug) : '';

  // Picture
  const img = l.image && typeof l.image === 'object' ? l.image : null;
  const imgId = img && typeof img.id === 'string' && IMAGE.idPattern.test(img.id) ? img.id : null;
  const alt = img && typeof img.alt === 'string' ? img.alt.trim() : '';
  const src = imgId ? (safeImageSrc(opts.imageSrc) || imageUrl(imgId)) : null;
  const w = img ? posInt(img.width) : null;
  const h = img ? posInt(img.height) : null;

  // Call to action
  const ctaUrl = safeCtaUrl(l.ctaUrl);
  const ctaLabel = plain(l.ctaLabel, 0);
  const showCta = !expired && !!ctaUrl && !!ctaLabel;

  const head = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(headlinePlain)} | ${esc(SITE.name)}</title>`,
    '<meta name="robots" content="noindex, nofollow">',
    description ? `<meta name="description" content="${esc(description)}">` : '',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:title" content="${esc(headlinePlain)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : '',
    pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">` : '',
    imgId ? `<meta property="og:image" content="${esc(origin + imageUrl(imgId))}">` : '',
    imgId && alt ? `<meta property="og:image:alt" content="${esc(alt)}">` : '',
    '<link rel="icon" href="/favicon.ico">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${esc(FONTS_CSS)}" rel="stylesheet">`,
    `<style>${STYLE}</style>`,
    expired ? `<link rel="stylesheet" href="${EXPIRED_ASSETS.css}">` : '',
    isPreview ? '' : `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>\n<script>${GA_INLINE}</script>`,
    '</head>'
  ];

  const body = [
    '<body>',
    isPreview && state === 'draft'
      ? '<div class="yl-preview" role="note">Draft preview: visitors cannot see this page until it is Live.</div>' : '',
    '<header class="yl-top"><div class="yl-wrap">',
    `<a class="yl-brand" href="${SITE.url}"><img src="${EMBLEM}" alt="" width="40" height="40">${esc(SITE.name)}</a>`,
    '</div></header>',
    '<main>',
    '<section class="yl-hero"><div class="yl-wrap">',
    plain(l.eyebrow, 0) ? `<p class="yl-eyebrow">${inlineHtml(l.eyebrow)}</p>` : '',
    `<h1>${inlineHtml(l.headline) || esc(headlinePlain)}</h1>`,
    '</div></section>',
    src ? `<div class="yl-wrap"><figure class="yl-pic"><img src="${esc(src)}" alt="${esc(alt)}"${w && h ? ` width="${w}" height="${h}"` : ''}></figure></div>` : '',
    `<section class="yl-copy"><div class="yl-wrap"><div class="yl-text">\n${blocksHtml(l.body)}</div></div></section>`,
    showCta
      ? `<section class="yl-cta"><div class="yl-wrap"><a class="yl-btn" href="${esc(ctaUrl)}">${esc(ctaLabel)}</a></div></section>` : '',
    '</main>',
    '<footer class="yl-foot"><div class="yl-wrap">',
    `<p><strong>${esc(SITE.name)}</strong></p>`,
    `<p><a href="mailto:${SITE.email}">${SITE.email}</a> &middot; <a href="${SITE.url}">${SITE.host}</a></p>`,
    '</div></footer>',
    expired ? `<script type="application/json" id="${EXPIRED_DATA_ID}">${payloadToScriptJson({ ...LANDING_EXPIRED, state })}</script>` : '',
    expired ? `<script src="${EXPIRED_ASSETS.js}" defer></script>` : '',
    '</body>',
    '</html>',
    ''
  ];

  const html = [...head, ...body].filter((line) => line !== '').join('\n');

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': isPreview ? 'private, no-store' : 'public, max-age=60',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': CSP
  };

  return { html, headers };
}
