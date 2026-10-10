/* YAVD Offers Module: the popup visitors see (Session 1.6)
 *
 * Loaded (defer) only on pages the edge function attached an offer to. It reads
 * the JSON block #yavd-offer-data ({ v, isTest, offer }) and builds the popup.
 *
 * Security: every piece of offer text is placed with textContent or as an
 * attribute value set through the DOM. Nothing from the offer is ever parsed
 * as HTML. The button link (form off) is limited to https/http or a same-site
 * path.
 *
 * Shared names (form fields, labels, subject line, 7-day memory, 1.5 s delay)
 * come from the frozen contract, /shared/offer-contract.js, loaded with a
 * dynamic import. If anything here fails, the page stays exactly as it was.
 *
 * Events: "yavd-offer:view" when the popup opens and "yavd-offer:lead" when a
 * submission succeeds, both on document, with { id, isTest } in detail.
 *
 * Counts (Session 1.9): the first open on each page view and each successful
 * submission are also sent to /api/offers/stats. Previews (isTest) are never
 * sent. Fire and forget: a failed count never shows the visitor anything.
 */
(function () {
  'use strict';

  var CONTRACT_URL = '/shared/offer-contract.js';
  var SUBMIT_URL = '/offers-form.html';   // Netlify accepts the post here; edge functions skip this path
  var STATS_URL = '/api/offers/stats';     // Session 1.9 counts (route set in netlify/functions/offers-stats.mjs)
  var WIDE = { message: 1, heard_from: 1, option_choice: 1 };
  var TYPES = { email: 'email', phone: 'tel' };
  var AUTOCOMPLETE = { name: 'name', title: 'organization-title', email: 'email', phone: 'tel', company: 'organization' };
  var PRIVACY = 'We use your details only to follow up on this offer. We never sell or share them.';
  var FAIL_MSG = 'Sorry, that did not go through. Please try again in a moment, or email michaelh@youravdept.com.';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function readPayload(dataId) {
    var el = document.getElementById(dataId);
    if (!el) return null;
    try {
      var data = JSON.parse(el.textContent || '');
      var o = data && data.offer;
      if (!o || typeof o.id !== 'string' || !o.id) return null;
      return data;
    } catch (e) { return null; }
  }

  function str(v) { return typeof v === 'string' ? v : ''; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /** Plain text to paragraphs: blank lines split paragraphs, single line breaks become <br>. */
  function textBlock(text) {
    var wrap = el('div', 'yavd-op-body');
    str(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach(function (para) {
      if (!para.trim()) return;
      var p = el('p');
      para.split('\n').forEach(function (line, i) {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      wrap.appendChild(p);
    });
    return wrap;
  }

  function safeUrl(u) {
    u = str(u).trim();
    if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
    if (/^\/(?!\/)[^\s\\]*$/.test(u)) return u;
    return null;
  }

  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, v) { try { window.localStorage.setItem(key, v); } catch (e) { /* private mode: no memory */ } }

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* old browser */ }
  }

  /** Session 1.9: one count, sent once, never for a preview. */
  function count(id, event, isTest) {
    if (isTest) return;
    try {
      fetch(STATS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, event: event }),
        credentials: 'omit',
        keepalive: true
      }).catch(function () { /* counts are best effort */ });
    } catch (e) { /* old browser: no count */ }
  }

  function start(C) {
    var data = readPayload(C.INJECT.dataElementId);
    if (!data) return;
    var offer = data.offer;
    var isTest = data.isTest === true;
    var form = offer.form && typeof offer.form === 'object' ? offer.form : { enabled: false };
    var memoryKey = C.VISITOR.closedKeyPrefix + offer.id;
    var uid = 'yavd-op-' + Math.random().toString(36).slice(2, 8);
    var lastFocus = null;
    var isOpen = false;
    var submitted = false;
    var viewCounted = false;

    /* ----- shell ----- */
    var root = el('div', 'yavd-op');
    var backdrop = el('div', 'yavd-op-backdrop');
    backdrop.hidden = true;
    var dialog = el('div', 'yavd-op-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', uid + '-h');
    dialog.setAttribute('aria-describedby', uid + '-b');
    dialog.tabIndex = -1;

    var closeBtn = el('button', 'yavd-op-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.appendChild(document.createTextNode('\u00d7'));

    var content = el('div');
    if (isTest) content.appendChild(el('span', 'yavd-op-test', 'Preview: submissions are marked as tests'));
    var h = el('h2', 'yavd-op-headline', str(offer.headline) || str(offer.name));
    h.id = uid + '-h';
    content.appendChild(h);
    var body = textBlock(offer.body);
    body.id = uid + '-b';
    content.appendChild(body);

    var scroller = el('div', 'yavd-op-scroll');
    scroller.appendChild(content);
    dialog.appendChild(closeBtn);
    dialog.appendChild(scroller);
    backdrop.appendChild(dialog);
    root.appendChild(backdrop);

    var tab = el('button', 'yavd-op-tab');
    tab.type = 'button';
    tab.hidden = true;
    tab.setAttribute('aria-label', 'Open offer: ' + (str(offer.headline) || str(offer.name)));
    tab.appendChild(el('span', 'yavd-op-tab-dot'));
    tab.appendChild(el('span', 'yavd-op-tab-text', str(offer.headline) || 'See the offer'));
    root.appendChild(tab);

    /* ----- form, or a plain button ----- */
    if (form.enabled) {
      content.appendChild(buildForm());
    } else {
      var url = safeUrl(offer.buttonUrl);
      var label = str(form.buttonLabel);
      if (url && label) {
        var a = el('a', 'yavd-op-btn', label);
        a.href = url;
        content.appendChild(a);
      }
    }

    function buildForm() {
      var f = el('form', 'yavd-op-form');
      f.setAttribute('novalidate', '');
      f.setAttribute('name', C.FORM_NAME);
      var allowed = {};
      C.FIELD_NAMES.forEach(function (n) { allowed[n] = 1; });
      var fields = (Array.isArray(form.fields) ? form.fields : []).filter(function (n, i, arr) {
        return allowed[n] && arr.indexOf(n) === i;
      });
      var required = {};
      (Array.isArray(form.required) ? form.required : []).forEach(function (n) { required[n] = 1; });
      var extraLabels = form.extraLabels && typeof form.extraLabels === 'object' ? form.extraLabels : {};

      function hidden(name, value) {
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = name; i.value = value;
        f.appendChild(i);
      }
      hidden('form-name', C.FORM_NAME);
      hidden('subject', C.alertSubject(str(offer.name), isTest));
      hidden('offer_name', str(offer.name));
      hidden('offer_slug', str(offer.slug));
      hidden('offer_id', offer.id);
      hidden('is_test', isTest ? 'yes' : 'no');

      var hp = el('div', 'yavd-op-hp');
      hp.setAttribute('aria-hidden', 'true');
      var hpIn = document.createElement('input');
      hpIn.name = 'bot-field'; hpIn.tabIndex = -1; hpIn.autocomplete = 'off';
      hp.appendChild(hpIn);
      f.appendChild(hp);

      var grid = el('div', 'yavd-op-grid');
      var controls = [];
      fields.forEach(function (name) {
        var isExtra = /^extra_[123]$/.test(name);
        var labelText = isExtra ? (str(extraLabels[name]).trim() || C.FIELD_LABELS[name]) : C.FIELD_LABELS[name];
        if (isExtra) hidden(name + '_label', labelText);
        var wrap = el('div', 'yavd-op-field' + (WIDE[name] ? ' is-wide' : ''));
        var id = uid + '-' + name;
        var lab = el('label', 'yavd-op-label', labelText);
        lab.htmlFor = id;
        var isReq = !!required[name];
        if (isReq) {
          var star = el('span', 'yavd-op-req', ' *');
          star.setAttribute('aria-hidden', 'true');
          lab.appendChild(star);
        }
        var input;
        if (name === 'message') {
          input = document.createElement('textarea');
          input.rows = 3;
        } else if (name === 'option_choice') {
          input = document.createElement('select');
          var first = document.createElement('option');
          first.value = ''; first.textContent = 'Select one';
          input.appendChild(first);
          (Array.isArray(form.optionChoices) ? form.optionChoices : []).forEach(function (c) {
            c = str(c);
            if (!c) return;
            var o = document.createElement('option');
            o.value = c; o.textContent = c;
            input.appendChild(o);
          });
        } else {
          input = document.createElement('input');
          input.type = TYPES[name] || 'text';
          if (name === 'exhibitor_count') input.inputMode = 'numeric';
        }
        input.className = 'yavd-op-input';
        input.id = id;
        input.name = name;
        input.maxLength = name === 'message' ? 4000 : 300;
        if (AUTOCOMPLETE[name]) input.autocomplete = AUTOCOMPLETE[name];
        if (isReq) { input.required = true; input.setAttribute('aria-required', 'true'); }
        var err = el('p', 'yavd-op-err');
        err.id = id + '-err';
        input.setAttribute('aria-describedby', err.id);
        input.addEventListener('input', function () { if (input.getAttribute('aria-invalid')) check(input, err); });
        wrap.appendChild(lab); wrap.appendChild(input); wrap.appendChild(err);
        grid.appendChild(wrap);
        controls.push({ input: input, err: err });
      });
      f.appendChild(grid);

      var btn = el('button', 'yavd-op-btn', str(form.buttonLabel) || 'Send');
      btn.type = 'submit';
      f.appendChild(btn);
      var status = el('p', 'yavd-op-status');
      status.setAttribute('role', 'alert');
      f.appendChild(status);
      f.appendChild(el('p', 'yavd-op-privacy', PRIVACY));

      function check(input, err) {
        var v = input.value.trim();
        var msg = '';
        if (input.required && !v) msg = 'Please fill this in.';
        else if (v && input.type === 'email' && !EMAIL_RE.test(v)) msg = 'Please enter a full email address.';
        err.textContent = msg;
        if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        return !msg;
      }

      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (btn.disabled) return;
        status.textContent = '';
        var firstBad = null;
        controls.forEach(function (c) { if (!check(c.input, c.err) && !firstBad) firstBad = c.input; });
        if (firstBad) { firstBad.focus(); return; }

        var params = new URLSearchParams();
        Array.prototype.forEach.call(f.elements, function (n) {
          if (n.name) params.append(n.name, n.value);
        });
        var label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending\u2026';
        fetch(SUBMIT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          credentials: 'same-origin'
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          submitted = true;
          showThanks();
          emit('yavd-offer:lead', { id: offer.id, isTest: isTest });
          count(offer.id, 'lead', isTest);
        }).catch(function () {
          btn.disabled = false;
          btn.textContent = label;
          status.textContent = FAIL_MSG;
        });
      });
      return f;
    }

    function showThanks() {
      while (content.firstChild) content.removeChild(content.firstChild);
      var t = el('div', 'yavd-op-thanks');
      t.tabIndex = -1;
      t.setAttribute('role', 'status');
      var mark = el('div', 'yavd-op-check', '\u2713');
      mark.setAttribute('aria-hidden', 'true');
      t.appendChild(mark);
      t.appendChild(el('p', '', str(form.thanks) || 'Thank you. We will be in touch shortly.'));
      var done = el('button', 'yavd-op-btn', 'Close');
      done.type = 'button';
      done.addEventListener('click', close);
      t.appendChild(done);
      content.appendChild(t);
      dialog.setAttribute('aria-labelledby', uid + '-t');
      t.id = uid + '-t';
      dialog.removeAttribute('aria-describedby');
      t.focus();
    }

    /* ----- open, close, memory ----- */
    function focusables() {
      return Array.prototype.filter.call(
        dialog.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.tabIndex !== -1 && n.offsetParent !== null; }
      );
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      lastFocus = document.activeElement;
      tab.hidden = true;
      backdrop.hidden = false;
      document.documentElement.classList.add('yavd-op-lock');
      // next frame so the fade and slide run
      requestAnimationFrame(function () { requestAnimationFrame(function () { backdrop.classList.add('is-open'); }); });
      dialog.focus();
      emit('yavd-offer:view', { id: offer.id, isTest: isTest });
      if (!viewCounted) { viewCounted = true; count(offer.id, 'view', isTest); }
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      backdrop.classList.remove('is-open');
      backdrop.hidden = true;
      document.documentElement.classList.remove('yavd-op-lock');
      if (!isTest) storageSet(memoryKey, String(Date.now()));
      if (!submitted) {
        tab.hidden = false;
        tab.focus();
      } else if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
        lastFocus.focus();
      }
    }

    closeBtn.addEventListener('click', close);
    tab.addEventListener('click', open);
    backdrop.addEventListener('mousedown', function (ev) {
      if (ev.target !== backdrop) return;
      ev.preventDefault();   // keep the browser from moving focus off the reopen tab
      close();
    });
    document.addEventListener('keydown', function (ev) {
      if (!isOpen) return;
      if (ev.key === 'Escape' || ev.key === 'Esc') { ev.preventDefault(); close(); return; }
      if (ev.key !== 'Tab') return;
      var list = focusables();
      if (!list.length) { ev.preventDefault(); dialog.focus(); return; }
      var first = list[0], last = list[list.length - 1];
      var active = document.activeElement;
      if (ev.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        ev.preventDefault(); last.focus();
      } else if (!ev.shiftKey && (active === last || !dialog.contains(active))) {
        ev.preventDefault(); first.focus();
      }
    });
    // Focus that wanders out (e.g. a click on the page through a gap) comes back.
    document.addEventListener('focusin', function (ev) {
      if (isOpen && !dialog.contains(ev.target)) dialog.focus();
    });

    document.body.appendChild(root);

    var closedAt = isTest ? NaN : Number(storageGet(memoryKey));
    var recentlyClosed = closedAt > 0 && (Date.now() - closedAt) < C.VISITOR.closedDays * 86400000;
    if (recentlyClosed) {
      tab.hidden = false;
    } else {
      setTimeout(open, C.VISITOR.openDelayMs);
    }
  }

  function boot() {
    import(CONTRACT_URL).then(start).catch(function (err) {
      if (window.console) console.warn('offer-panel: not shown', err && err.message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
