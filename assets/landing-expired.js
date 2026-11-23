/* YAVD Offers Module: the expiration popup on landing pages (Session 4.10).
 *
 * Loaded only on expired and archived landing pages. shared/landing-template.js
 * writes a JSON block (id "yavd-landing-expired") holding LANDING_EXPIRED from
 * shared/offer-contract.js plus the page state, and this script.
 *
 * - Every word comes from that block and is set with textContent. Nothing
 *   here is HTML, and the wording is never changed or added to.
 * - The button goes to buttonUrl only if it is https://. The email link only
 *   if the address looks like an email. Otherwise that part is left out.
 * - Opens about 600 ms after load. Closes on the close button, Escape, or a
 *   click on the dark backdrop. Focus stays inside while open and goes back
 *   to where it was (or the page heading) on close. The page behind is inert.
 * - No inline styles (the page CSP forbids them): classes only, styles in
 *   /assets/landing-expired.css. Separate from the offer popup, no shared code.
 */
(function () {
  'use strict';

  var DATA_ID = 'yavd-landing-expired';
  var OPEN_DELAY_MS = 600;
  var STATES = ['expired', 'archived'];

  function readData() {
    var el = document.getElementById(DATA_ID);
    if (!el) return null;
    try {
      var d = JSON.parse(el.textContent || '');
      if (!d || typeof d !== 'object' || typeof d.text !== 'string' || !d.text.trim()) return null;
      if (STATES.indexOf(d.state) === -1) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function httpsUrl(u) {
    if (typeof u !== 'string') return '';
    try {
      var url = new URL(u);
      return url.protocol === 'https:' ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function email(e) {
    return typeof e === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e) ? e : '';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function start(d) {
    var uid = 'yle-' + Math.random().toString(36).slice(2, 8);
    var url = httpsUrl(d.buttonUrl);
    var mail = email(d.email);
    var label = typeof d.buttonLabel === 'string' ? d.buttonLabel.trim() : '';

    var backdrop = el('div', 'yle-backdrop');
    backdrop.hidden = true;

    var dialog = el('div', 'yle-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', uid + '-t');
    dialog.tabIndex = -1;

    var closeBtn = el('button', 'yle-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = String.fromCharCode(215);   // the multiplication sign, as a close mark

    var text = el('p', 'yle-text', d.text);
    text.id = uid + '-t';

    dialog.appendChild(closeBtn);
    dialog.appendChild(text);

    if (url && label) {
      var btn = el('a', 'yle-btn', label);
      btn.href = url;
      btn.rel = 'noopener';
      dialog.appendChild(btn);
    }
    if (mail) {
      var p = el('p', 'yle-mail');
      var a = el('a', '', mail);
      a.href = 'mailto:' + mail;
      p.appendChild(a);
      dialog.appendChild(p);
    }
    backdrop.appendChild(dialog);

    // Everything already on the page goes inert while the popup is open.
    var behind = Array.prototype.slice.call(document.body.children);

    var isOpen = false;
    var lastFocus = null;

    function focusables() {
      return Array.prototype.filter.call(dialog.querySelectorAll('a[href], button'), function (n) {
        return !n.disabled && n.offsetParent !== null;
      });
    }

    function setInert(on) {
      behind.forEach(function (n) {
        if (n.tagName === 'SCRIPT') return;
        if (on) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
        else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
      });
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      var active = document.activeElement;
      lastFocus = active && active !== document.body && active !== document.documentElement ? active : null;
      backdrop.hidden = false;
      document.documentElement.classList.add('yle-lock');
      setInert(true);
      requestAnimationFrame(function () { requestAnimationFrame(function () { backdrop.classList.add('is-open'); }); });
      dialog.focus();
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      backdrop.classList.remove('is-open');
      backdrop.hidden = true;
      document.documentElement.classList.remove('yle-lock');
      setInert(false);
      if (lastFocus && document.contains(lastFocus) && lastFocus.focus) {
        lastFocus.focus();
      } else {
        var h = document.querySelector('main h1');
        if (h) {
          if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
          h.focus();
        }
      }
    }

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('mousedown', function (ev) {
      if (ev.target !== backdrop) return;
      ev.preventDefault();
      close();
    });
    document.addEventListener('keydown', function (ev) {
      if (!isOpen) return;
      if (ev.key === 'Escape' || ev.key === 'Esc') { ev.preventDefault(); close(); return; }
      if (ev.key !== 'Tab') return;
      var list = focusables();
      if (!list.length) { ev.preventDefault(); dialog.focus(); return; }
      var first = list[0], last = list[list.length - 1];
      var activeEl = document.activeElement;
      if (ev.shiftKey && (activeEl === first || activeEl === dialog || !dialog.contains(activeEl))) {
        ev.preventDefault(); last.focus();
      } else if (!ev.shiftKey && (activeEl === last || !dialog.contains(activeEl))) {
        ev.preventDefault(); first.focus();
      }
    });
    document.addEventListener('focusin', function (ev) {
      if (isOpen && !dialog.contains(ev.target)) dialog.focus();
    });

    document.body.appendChild(backdrop);
    setTimeout(open, OPEN_DELAY_MS);
  }

  function boot() {
    var d = readData();
    if (d) start(d);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
