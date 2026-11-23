# YAVD Offer Landing Pages: Scope
Status: APPROVED 2026-11-23, ready for phase planning. Michael answered questions 1 to 3 and asked for the build plan; the defaults for questions 4 to 9 stand. Written from the code (offers 1.3.0, edge functions, storage, admin screen), not from documentation.

## 1. Summary
Every offer gets its own landing page: a branded page at `/offers/landing-<name>.html` with a hero image, headline, copy and one call to action with a link. Michael creates, finds, edits and archives these pages inside the existing offer admin, with no file copied and no deploy. The popup stays exactly as it is (it still sits on an existing page) and now links to its landing page. The workflow becomes: (1) find or create the landing page, (2) create the popup connected to it, (3) set dates, save and schedule.

## 2. Users and roles
- Admin (Michael): same single password and sign-in as the Offers Module. Creates, edits, previews, archives and restores landing pages.
- Visitor: opens a landing page from a popup or a shared link. Reads it and clicks the call to action.

## 3. Core workflows
### Create an offer (new process)
1. In the editor, under Where and who, step 1: pick an existing landing page from a list, or press **+ New Landing Page**.
2. **+ New Landing Page** opens a window with: image drop, headline, copy, button label, button link, page name. A live preview sits beside it, as the popup editor already does. Save creates the page.
3. Step 2: the popup is created and connected to that landing page. Its button goes to the landing page automatically.
4. Step 3: set dates, save, schedule (unchanged).

### Find, edit, archive
1. A Landing Pages list in the admin shows every page: name, address, status (Draft, Live, Archived), the offers that use it, last edited.
2. Search by name or address. Filter by status.
3. Edit opens the same window as New. Archive takes the page out of service. Restore brings it back.

### Visitor
1. Opens `/offers/landing-<name>.html` (the `.html` is optional). Sees the page.
2. A draft page shows only with its preview key.
3. Before its offer starts, the page is not public: the visitor is sent to the home page (temporary redirect).
4. While its offer is running, the page shows normally.
5. After its offer ends, or when the page is archived, the page itself stays exactly as it was, and the site standard expiration popup opens over it (see section 4). The page's own call to action is hidden so nobody clicks into a dead offer.

## 4. Features
### Must have
- **+ New Landing Page** button under Where and who, opening a window (not a new browser tab) with image drop and copy entry.
- Fixed template, locked to the Your AV Department brand. Fields only: page name, address name, hero image with alt text, headline, copy, call to action label, call to action link. No free HTML.
- Saved at `/offers/landing-<name>.html`. The address name is suggested from the page name, editable until the first publish, then locked.
- Landing Pages list: find, edit, archive, restore.
- Offer editor: choose a landing page for the offer; the popup button goes to it. An offer with no landing page works exactly as today.
- Draft, Live and Archived states. Preview link for drafts.
- **The offer's dates control the landing page** [CONFIRMED]. A page is public from the start of its linked offer, and expires after the end of its linked offer. A page linked to several offers is public from the earliest start to the latest end of its non-draft offers. A page with no linked offer is public while it is Live. Archiving expires the page at once, whatever the dates.
- **Site standard expiration popup** [CONFIRMED]. On an expired or archived page the page itself is unchanged (same address, same content) and one popup opens over it with this wording: "This offer is no longer available. However you can contact Your AV Department to find out what current offers are available." It is one fixed component for every landing page, the wording lives in one place (the contract), and Michael does not edit it per page. It carries a button to contact Your AV Department. [ASSUMED] The button goes to the site's standard call to action (the Strategic Review booking link already used on every page), with michaelh@youravdept.com shown beneath it. The popup can be closed with its close button or Escape, so a visitor can still read the page; the page's own call to action stays hidden. Keyboard focus is trapped in the popup while open and announced to screen readers.
- Server-side validation of every field. Signed-in only for every change.
- Every save keeps the previous version (last 20), as offers do.
- Export includes landing pages (and their pictures).
- Landing pages stay out of search results.
- Pre-publish check: required fields filled, call to action link well formed and (where the server can) reachable.

### Should have
- Several offers may share one landing page; the default is a new page per offer.
- Views and clicks per landing page on its list row (same pattern as offers stats).
- Duplicate a landing page as the start of a new one.

### Later
- More than one page layout.
- Multiple images, video, embedded forms on the landing page.
- Permanent delete (v1 archives only).
- A/B variants.

## 5. Data
### Landing record (new store `offer-landings`, `-test` on every non-production deploy)
| Field | What it holds |
|---|---|
| id | random, never reused |
| name | Michael's name for the page (list and admin only) |
| slug | the part after `landing-`, same pattern as offer slugs (3 to 60, a-z 0-9 hyphen) |
| eyebrow | optional short line above the headline |
| headline | plain text with the existing formatting tags |
| body | plain text with the existing formatting tags, line breaks kept |
| image | one picture: id, alt (required), width, height (same shape as offer pictures) |
| ctaLabel | button text |
| ctaUrl | `https://` link, or a same-site path. No `javascript:`, no `//host` tricks |
| status | draft, live or archived |
| previewKey | random, never sent to visitors |
| createdAt, updatedAt, archivedAt | ISO |

### Offer record (additive)
- `landing`: the slug of its landing page, or null. Absent on older offers and read as null.

### Where it is stored
- Landing records: one Netlify Blobs store, key `all` plus `history/...`, using the same safe-write pattern as offers (read with ETag, keep the old copy, write only if unchanged, retry up to 3 times).
- Pictures: the existing `offer-images` store and upload route.
- Not in the repo and not in git. Backup is Export. Most sensitive data held: none about visitors. The pages are public content.

## 6. Identity, auth and integrations
- Same sign-in, cookie and lockout as the Offers Module. Every admin route calls `requireAdmin`.
- New routes (names for the contract): `/api/offers/landings` (GET list, POST create or update), `/api/offers/landings/archive` (POST). Public page route `/offers/*`.
- No new services, no new dependencies.

## 7. Platforms and UX
- Landing page: Polished tier, desktop and phone. Brand: AV Navy #152B4A, Signal Teal #2AA4A2 for the button and accents, white base, Montserrat 800 headings, Inter body, matching the standalone pages already on the site. Logo with URL at the top. A small footer with the business name, michaelh@youravdept.com and youravdept.com.
- Accessibility: alt text required, one H1, contrast checked, keyboard focus on the button, no text over the picture.
- Admin window and list: Functional tier, same look as the offer editor, usable on a phone.

## 8. The five objectives
- Security: landing HTML is built on the server from escaped fields, never from stored HTML. Copy uses the existing formatting tags only. The call to action link is checked for scheme. Pages carry `X-Content-Type-Options: nosniff` and a content security policy that blocks scripts other than the site's own analytics tag. Preview keys never reach visitors. Admin routes are server-checked.
- Stability: if landing storage cannot be read, the visitor gets the normal site (a quiet redirect to the home page), never an error page. Every save keeps the previous version. Archive is reversible.
- Efficiency: one cached lookup per page view, rendered once and cached for up to a minute (the offers pattern). No build, no deploy.
- User experience: the three-step process is the editor's order. Live preview in the window. Plain error messages.
- Scalability: sized for about 50 landing pages a year. One record array is fine at that size; no cap in the design.

## 9. Constraints and findings from the code
1. **The site is static and published from this PC by `deploy.ps1`.** A running site cannot write a new `.html` file into `/offers/`. So each landing page is a stored record, and a function serves it at `/offers/landing-<name>.html` from one locked template. Visitors see exactly the address Michael asked for. [ASSUMED] Mark proves in the first session that the function path wins over static files on Netlify before anything else is built.
2. **The popup edge function would put popups on landing pages.** `offer-page.js` runs on `/*` and treats any `.html` path as a page. `/offers/` must be added to its skip list (and `excludedPath`), and to the takedown function's excluded paths.
3. **Picture cleanup would delete landing pictures.** The Phase 3 cleanup removes pictures that no offer or saved offer version uses, after 24 hours. It must also count landing records and their versions, or hero images disappear a day after saving. This is the highest-risk change.
4. **The page dropdown only lists deployed files.** Landing pages will not appear in it, so no popup can sit on a landing page. This is intended. The site map will not list them either; the Landing Pages list is their index.
5. **Contract 1.3.0 is frozen.** This needs contract 1.4.0, additive: the `landing` offer field and its public key, landing constants (including the expiration popup wording), routes and the `offer-landings` store. Michael approves this scope, which counts as approval of the 1.4.0 change.
5a. **Expiry is worked out, never stored**, like offer status: the landing function reads the landing record and the offers linked to it, then decides before-start, running or expired. It needs one cached read of each store per page view (same cache pattern, up to a minute). If the offers cannot be read, the page shows as normal without a popup rather than showing an error.
5b. **The expiration popup is a new small script and style file** under `/assets/`, separate from the offer popup so the two can never interfere.
6. **Names:** `/offer/` is the private link prefix, `/offers-form` is a static page, `/offers/` is new. They do not clash, but the three look alike, so the admin always shows the full address.
7. Deploy script, host and password setting do not change. `netlify.toml` gets a header rule for `/offers/*` (noindex).
8. Open backlog item: the "twenty parallel views" test fails on this PC (14 of 20). This feature reuses the same save pattern for landing views, so Mark should resolve that first or keep views out of v1.
9. No CI exists in this repo (local test runs only).

## 10. Out of scope
- Editing any existing page (booth-proof, home and so on).
- Payments, forms or lead capture on the landing page. The call to action is a link; the popup keeps its own form.
- Writing the landing page copy.
- Landing pages on the Onyva site.
- Permanent delete, page layouts other than the one template, multiple images.

## 11. Open questions
Resolved by Michael on 2026-11-23:
1. Hero: the top band with the headline and the one image. [CONFIRMED]
2. The offer's dates control the landing page. [CONFIRMED]
3. An expired or archived page keeps its address and content, and shows the site standard expiration popup. [CONFIRMED, wording in section 4]

Still open. Each has a default I will use unless Michael objects:
4. Search engines: [ASSUMED] landing pages are noindex, like every other offer link.
5. Shared pages: [ASSUMED] default is one new page per offer, but an offer may pick any existing page, so two offers can share one.
6. Order: [ASSUMED] this is Phase 4, built before Phase 2 (Key Actions Dashboard), which stays planned.
7. Footer: [ASSUMED] business name, michaelh@youravdept.com and youravdept.com only (no street address or phone).
8. New, from answer 3: [ASSUMED] the popup's button goes to the standard Strategic Review booking link, with the email beneath it.
9. New, from answer 2: [ASSUMED] before an offer starts, its landing page redirects to the home page rather than showing a "coming soon" page.

## 12. Success criteria
- Michael creates a landing page in the admin with no file copied and no deploy, and opens it at `/offers/landing-<name>.html` on the live site.
- He creates a popup for an offer and connects it to that page; the popup button opens the page.
- He finds a page in the list by name and by address, edits it, archives it and restores it.
- A draft shows only with its preview key. Before its offer starts the page sends visitors home.
- After the linked offer ends, and after archiving, the page address still loads with unchanged content and the expiration popup opens with the exact standard wording. The page's own call to action is hidden. The popup closes with its button and Escape and works on a phone.
- A page linked to two offers stays public until the later of the two ends.
- The page matches the brand: colors, fonts, logo, alt text, one H1, usable on a phone (checked by Andy on the first real page).
- Every admin change is refused when not signed in. Visitors cannot reach drafts or the admin data.
- With landing storage switched off in a test, the rest of the site, the offers and the popups still load.
- A hero picture is still there after the 24 hour grace period and after the next save of any offer (cleanup proven not to remove it).
- Existing offers, pages and Export behave as before; Export includes the landing pages.
- No popup appears on a landing page.
