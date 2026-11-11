# YAVD Offers Module: Images Scope

Status: APPROVED 2026-11-10, ready for phase planning. Approval includes the additive contract bump 1.2.0 to 1.3.0. Planned in ai/phases/phase-3-offer-images.md.
Lives at ai/spec/offer-images-scope.md. Extends ai/spec/offers-scope.md (Phase 1, live since 2026-10-10). Written from the live code (shared/offer-contract.js 1.2.0, offers-store.mjs, offers-rules.mjs, offers-export.mjs, offer-edge.js, netlify.toml), not from documentation.

Decisions already made with Michael (2026-11-10): placement is chosen per offer; one image per offer; Export embeds the images; no "Delete image now" button in the first build.

## 1. Summary

Let Michael add one image to any offer from the admin editor, with no deploy and no file copied into the site folder. He picks a file, writes a short description, chooses where it sits in the popup (top banner, left of the text, or right of the text), sees it in the live preview, and saves. The image is stored in Netlify Blobs, shown in the popup, and removed automatically once nothing refers to it. Today the offer record has no image field and offer copy is plain text only, so this is a new field, a new store and a contract change.

## 2. Users and roles

- Admin (Michael): uploads, replaces and removes the image on an offer. Same single password and session as the rest of the module.
- Visitor: sees the image inside the popup. Cannot upload anything.

No new roles.

## 3. Core workflows

### Add an image
1. Open an offer in the editor (new or existing).
2. In a new "Image" block under Popup copy, choose Add image and pick a file from the computer.
3. The browser checks the type, shrinks the picture, and shows it in the live preview at once.
4. Write the description (alt text). It is required whenever an image is attached.
5. Choose placement: Top banner (default), Left of text, or Right of text.
6. Save as draft or Save and schedule. The image uploads when the offer is saved.
7. Open the preview link to see it exactly as visitors will.

### Replace or remove the image
1. Edit the offer, choose Replace image or Remove image, Save.
2. The old image is not erased by hand. It is cleaned up automatically (workflow below).

### Visitor
1. Popup opens about 1.5 seconds after load, as today.
2. The image is part of the popup. On a phone, Left and Right placements stack above the text.
3. If the image fails to load, the popup still works and the space collapses.

### Delete a draft or let an offer expire
1. Deleting a draft removes the offer from the list. Its image stays for now, because the previous list is kept under Saved versions and a restore must come back whole.
2. An expired offer keeps its image so Run again works. A rerun points to the same image.

### Automatic cleanup
1. After a save, the server looks for stored images that are not used by any current offer and not used by any of the saved versions (newest 20).
2. Such an image is deleted, unless it was uploaded in the last 24 hours (so an upload that has not been saved yet is never lost).
3. This runs on each save, best effort. A failure is logged and retried on the next save, the same way saved-version trimming works today.

### Export
1. Export downloads the offers file as today, now with each image embedded in it, so one file holds everything.

## 4. Features

### Must have
- One image per offer, added, replaced and removed in the editor.
- File types: JPG, PNG, WebP. Nothing else (no SVG, GIF or video).
- Browser-side shrink before upload: longest side 1600 px, re-encoded to JPEG or WebP, which also strips camera metadata such as location. Target under 400 KB, hard cap 600 KB after processing.
- Server re-checks everything: signed-in only, file type read from the file's own bytes (not the name or the browser's claim), size cap, dimension sanity.
- Required description (alt text), up to 125 characters.
- Placement per offer: Top banner, Left of text, Right of text. Default Top banner.
- Image shown in the editor's live preview (Desktop and Phone) and in the real popup and preview link.
- Image address uses a random unguessable id; the file is served publicly by id, with long caching and a no-index header.
- Automatic cleanup as described in section 3.
- Export embeds images of the current offers.
- Rerun keeps the image reference.
- Test stores: non-production deploys use their own image store, like offers and stats.

### Should have
- Dashboard card shows a small thumbnail.
- Clear messages: wrong file type, too large after shrinking, upload failed (the offer text is still saved).

### Later
- Delete image now button (with a warning that it breaks restoring older saved versions).
- Reuse an image already uploaded for another offer (an image library).
- Crop and focal-point controls.
- Image as a link or button.
- Background image, GIF, video.
- Restore-from-export screen (import).

## 5. Data

### Offer record changes (contract 1.2.0 to 1.3.0, additive)
| Field | What it holds |
|---|---|
| image | null, or { id, alt, placement, width, height, type, bytes } |

- id: random, never reused, 32 hex characters.
- alt: the description, up to 125 characters.
- placement: "top", "left" or "right".
- width and height: set by the server so the popup reserves space and does not jump.
- An offer saved before 1.3.0 has no image and shows exactly as before.
- The image object is added to the public popup data (PUBLIC_OFFER_KEYS). Nothing private is added.

### Storage
- New Netlify Blobs store "offer-images" (base name; "-test" on every non-production deploy, same storeName rule). Key: the image id. The file bytes, with the type and upload time kept as metadata.
- Offers and saved versions continue to hold only the image reference, not the bytes.
- Most sensitive data held: marketing pictures chosen by Michael. Treated as public once an offer shows them. Camera location data is removed on upload.
- Retention: until the cleanup rule removes it. Backup: embedded in Export.

### Estimated size
About 50 offers a year at roughly 300 KB each: around 15 MB a year. No cap is built into the design.

## 6. Identity, auth and integrations
- Upload and remove require the existing signed-in cookie. Checked on the server on every call.
- Viewing an image needs no sign-in (visitors must see it). The id is random, so a draft's image cannot be found by guessing.
- New routes (names set when the contract is frozen): an upload route (signed in), an image-serving route (public, GET by id).
- No new dependency. Shrinking uses the browser's built-in canvas. The server only validates, stores and serves.
- No change to the lead form, Netlify Forms, or submission-created.mjs.

## 7. Platforms and UX
- Desktop and phone web, same as the popup today. Popup stays Polished tier, brand colors.
- Left and Right placements switch to stacked-on-top below a phone-width breakpoint.
- Image has explicit dimensions, so the popup does not shift when it loads.
- Accessible: required alt text; the image is announced properly; keyboard and Escape behavior of the popup unchanged; contrast of text over or beside the image stays readable (the image is never placed behind text).
- Editor: Functional tier. Add, Replace and Remove are plain buttons with a visible file name, size and thumbnail.

## 8. The five objectives
- Security: signed-in-only upload; type read from file bytes; SVG refused because it can carry script; size and dimension caps; random ids; no-index header and nosniff on served images; camera metadata stripped; alt text treated as plain text like all other offer copy.
- Stability: a failed upload never loses the offer text; an image that cannot be read makes the popup show without it, never an error page; storage failure follows the existing rule (serve the normal page); cleanup never deletes a referenced or fresh image; Export holds a full backup.
- Efficiency: images shrunk before upload; served with long immutable caching; edge function adds only a small reference to the page; one extra request per popup view.
- User experience: preview shows the image as typed and picked; phone stacking; no layout jump; clear error text.
- Scalability: one blob per image; no limit on offers or images; sized for about 50 offers a year.

## 9. Constraints
- Host and stack unchanged: Netlify, static site, Blobs, deploy.ps1.
- Frozen contract: shared/offer-contract.js changes to 1.3.0. Additive only. Approval of this scope is the approval for that bump.
- Netlify Functions accept request bodies of about 6 MB, which is why the shrink-first step and the 600 KB cap exist.
- Export is one function response: images are embedded, so a very large set could exceed the response size. See open questions.
- Existing pages are not edited. New and changed files only.
- Michael's time is the scarcest resource.

## 10. Out of scope
- Anything in section 4 under Later.
- Changes to the wording or design of any page other than the popup.
- Images in the lead alert email.
- Changing how the lead form, stats or sign-in work.

## 11. Open questions
MUST RESOLVE: none. (The contract shape is additive, ids are random and never reused, so nothing here is expensive to reverse.)

SHOULD RESOLVE (settle in phase planning, in a short spike session):
1. Export size. Embedded images in one download may exceed the function response limit if many offers carry images. Proposed handling: embed only the current offers' images, and if the total would be too large, say so plainly and offer a second download for the rest. Confirm limits with a real test before building.

ASSUMED (stated so Michael can object):
1. Placement default is Top banner.
2. Longest side 1600 px, hard cap 600 KB after shrinking, JPG, PNG and WebP only.
3. Alt text is required, 125 characters.
4. Cleanup grace period is 24 hours; the image is kept while any of the newest 20 saved versions refers to it.
5. Image id is public to anyone who sees the popup; that is acceptable because the image is meant to be public.
6. Thumbnails on dashboard cards come from the same stored image (no second copy).

## 12. Success criteria
1. Michael adds an image to an offer in the admin, with no deploy and no file copied, and sees it in the live preview.
2. The image shows in the real popup on desktop and phone for each of the three placements, with no layout jump.
3. A file of the wrong type (including SVG) or over the cap is refused with a clear message, on the server as well as in the browser.
4. Upload and remove refuse anyone not signed in (the admin routes return 401); the image itself loads for a visitor with no sign-in.
5. Replace and Remove work; the old image is cleaned up only once no current offer and no saved version uses it, and never within 24 hours of upload.
6. Delete a draft that has an image, then restore it from Saved versions: it comes back with its image.
7. Export contains the images, and the file's contents match what is stored.
8. With image storage switched off in a test, the popup and all pages still load (popup shows without the image).
9. Existing offers (no image) behave exactly as before.
