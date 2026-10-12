// Anonymous usage tally. Sends only an event name ("visit", "install" or "convert").
// Never sends file names, sizes or contents. Failures are ignored: counting must never break the app.
export function count(event) {
  try {
    const url = new URL('/api/just-the-audio/count', location.origin);
    url.searchParams.set('e', event);
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* offline or blocked: ignore */ }
}
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/just-the-audio/sw.js', { scope: '/just-the-audio/' }).catch(() => {});
  }
}
