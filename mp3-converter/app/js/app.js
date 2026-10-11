import {
  STATUS, makeItem, nextWaiting, summarize, mp3Name, uniqueName, formatBytes, formatRemaining,
} from './queue.js';
import { convert, browserSupported } from './engine.js';
import { count, registerServiceWorker } from './count.js';

const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone'), picker = $('picker'), rowsEl = $('rows');
const queueEl = $('queue'), emptyNote = $('empty-note'), summaryEl = $('summary');
const batchBar = $('batch-bar'), downloadAllBtn = $('download-all'), clearBtn = $('clear-finished');
const folderBtn = $('choose-folder'), folderLabel = $('folder-label'), liveEl = $('live');
const unsupportedEl = $('unsupported'), keepOpen = $('keep-open');

/** @type {ReturnType<typeof makeItem>[]} */
let items = [];
let active = null;        // { item, cancel }
let dirHandle = null;     // chosen output folder, if any
const usedNames = new Set();
let speed = 0;            // bytes of source per second, smoothed, for time estimates

const ICON_CHECK = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
const ICON_WARN = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5v.5"/></svg>';

function announce(text) { liveEl.textContent = text; }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, className, onClick, ariaLabel) {
  const b = el('button', 'btn ' + className, label);
  b.type = 'button';
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

function rowView(item) {
  const li = el('li', 'row is-' + item.status);
  li.dataset.id = item.id;
  const main = el('div', 'row-main');
  const text = el('div', 'row-text');
  const side = el('div', 'row-side');
  const status = el('span', 'row-status');
  let name = item.name, detail = formatBytes(item.size);

  if (item.status === STATUS.DONE) {
    name = item.outName;
    detail = `From ${item.name} (${formatBytes(item.size)}). MP3 is ${formatBytes(item.outSize)}.`;
    if (item.savedToFolder) detail += ' Saved to your folder.';
    status.innerHTML = ICON_CHECK; status.append('Done');
    side.append(status);
    if (item.blob) side.append(button('Download', 'btn-primary', () => download(item), `Download ${item.outName}`));
  } else if (item.status === STATUS.CONVERTING) {
    const pct = Math.round(item.progress * 100);
    const left = speed > 0 ? formatRemaining((item.size * (1 - item.progress)) / speed) : '';
    detail = formatBytes(item.size) + (left ? '. ' + left[0].toUpperCase() + left.slice(1) + ' on this file.' : '');
    status.textContent = `Converting, ${pct}%`;
    side.append(status, button('Cancel', 'btn-ghost', () => cancelItem(item), `Cancel ${item.name}`));
  } else if (item.status === STATUS.WAITING) {
    status.textContent = nextWaiting(items) === item && active ? 'Waiting, next up' : 'Waiting';
    side.append(status, button('Remove', 'btn-ghost', () => removeItem(item), `Remove ${item.name}`));
  } else {
    detail = item.error;
    status.innerHTML = ICON_WARN;
    status.append(item.status === STATUS.SKIPPED ? 'Skipped' : 'Failed');
    side.append(status, button('Dismiss', 'btn-ghost', () => removeItem(item), `Dismiss ${item.name}`));
  }

  text.append(el('div', 'row-name', name), el('div', 'row-detail', detail));
  main.append(text, side);
  li.append(main);
  if (item.status === STATUS.CONVERTING) {
    const bar = el('div', 'bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `Progress for ${item.name}`);
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(Math.round(item.progress * 100)));
    const fill = el('span'); fill.style.width = (item.progress * 100).toFixed(1) + '%';
    bar.append(fill); li.append(bar);
  }
  return li;
}

function render() {
  const has = items.length > 0;
  queueEl.hidden = !has;
  emptyNote.hidden = has;
  dropzone.classList.toggle('is-empty', !has);
  rowsEl.replaceChildren(...items.map(rowView));

  const s = summarize(items);
  let line = `${s.done} of ${s.total} converted`;
  if (s.failed) line += `, ${s.failed} failed`;
  if (s.busy && speed > 0) { const left = formatRemaining(s.remainingBytes / speed); if (left) line += ', ' + left; }
  summaryEl.textContent = s.total ? line : 'Nothing to convert yet';
  batchBar.style.width = (s.fraction * 100).toFixed(1) + '%';
  keepOpen.hidden = !s.busy;

  const ready = items.filter((i) => i.status === STATUS.DONE && i.blob);
  downloadAllBtn.disabled = ready.length === 0;
  downloadAllBtn.textContent = ready.length ? `Download all finished (${ready.length})` : 'Download all finished';
  clearBtn.disabled = !items.some((i) => [STATUS.DONE, STATUS.FAILED, STATUS.SKIPPED].includes(i.status));
  document.title = s.busy ? `${Math.round(s.fraction * 100)}% - MP4 to MP3 Converter` : 'MP4 to MP3 Converter';
}

// Progress ticks update only the active row and header, so focus on other buttons is not lost.
function renderProgress(item) {
  const li = rowsEl.querySelector(`[data-id="${item.id}"]`);
  if (!li) return render();
  const fresh = rowView(item);
  li.querySelector('.row-status').textContent = fresh.querySelector('.row-status').textContent;
  li.querySelector('.row-detail').textContent = fresh.querySelector('.row-detail').textContent;
  const bar = li.querySelector('.bar');
  bar.setAttribute('aria-valuenow', String(Math.round(item.progress * 100)));
  bar.firstChild.style.width = (item.progress * 100).toFixed(1) + '%';
  const s = summarize(items);
  batchBar.style.width = (s.fraction * 100).toFixed(1) + '%';
  let line = `${s.done} of ${s.total} converted`;
  if (s.failed) line += `, ${s.failed} failed`;
  if (speed > 0) { const left = formatRemaining(s.remainingBytes / speed); if (left) line += ', ' + left; }
  summaryEl.textContent = line;
  document.title = `${Math.round(s.fraction * 100)}% - MP4 to MP3 Converter`;
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const added = files.map(makeItem);
  items.push(...added);
  const skipped = added.filter((i) => i.status === STATUS.SKIPPED).length;
  announce(`${added.length - skipped} file${added.length - skipped === 1 ? '' : 's'} added to the queue` + (skipped ? `, ${skipped} skipped.` : '.'));
  render();
  pump();
}

async function pump() {
  if (active) return;
  const item = nextWaiting(items);
  if (!item) return;
  item.status = STATUS.CONVERTING; item.progress = 0; item.startedAt = performance.now();
  let lastPaint = 0;
  const job = convert(item.file, {
    onProgress(p) {
      item.progress = p;
      const elapsed = (performance.now() - item.startedAt) / 1000;
      if (elapsed > 2 && p > 0.01) {
        const now = (item.size * p) / elapsed;
        speed = speed ? speed * 0.7 + now * 0.3 : now;
      }
      const t = performance.now();
      if (t - lastPaint > 250) { lastPaint = t; renderProgress(item); }
    },
  });
  active = { item, cancel: job.cancel };
  render();
  try {
    const blob = await job.promise;
    item.outName = uniqueName(mp3Name(item.name), usedNames);
    usedNames.add(item.outName.toLowerCase());
    item.outSize = blob.size; item.blob = blob; item.progress = 1; item.status = STATUS.DONE;
    if (dirHandle) await saveToFolder(item);
    announce(`${item.outName} is done.`);
    count('convert');
  } catch (err) {
    if (err && err.code === 'canceled') {
      items = items.filter((i) => i !== item);
      announce(`${item.name} canceled.`);
    } else {
      item.status = STATUS.FAILED;
      item.error = (err && err.message) || 'This file could not be converted.';
      announce(`${item.name} failed. ${item.error}`);
    }
  } finally {
    item.file = item.status === STATUS.DONE ? null : item.file; // let the browser release the source
    active = null;
    render();
    pump();
  }
}

function cancelItem(item) { if (active && active.item === item) active.cancel(); }
function removeItem(item) { items = items.filter((i) => i !== item); render(); }

function download(item) {
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url; a.download = item.outName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function saveToFolder(item) {
  try {
    const handle = await dirHandle.getFileHandle(item.outName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(item.blob);
    await writable.close();
    item.savedToFolder = true;
  } catch (err) {
    console.error(err);
    item.savedToFolder = false; // the Download button still works
  }
}

async function chooseFolder() {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'mp3-output' });
    folderLabel.textContent = `Saving to: ${dirHandle.name}`;
    folderBtn.textContent = 'Change folder';
    announce(`Finished MP3s will be saved to ${dirHandle.name}.`);
  } catch { /* picker closed: keep the current setting */ }
}

// Wiring
dropzone.addEventListener('click', () => picker.click());
picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });
['dragenter', 'dragover'].forEach((type) => window.addEventListener(type, (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropzone.classList.add('is-over');
}));
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropzone.classList.remove('is-over'); });
window.addEventListener('drop', (e) => {
  e.preventDefault(); dropzone.classList.remove('is-over');
  if (!dropzone.disabled && e.dataTransfer) addFiles(e.dataTransfer.files);
});
downloadAllBtn.addEventListener('click', async () => {
  for (const item of items.filter((i) => i.status === STATUS.DONE && i.blob)) {
    download(item);
    await new Promise((r) => setTimeout(r, 400)); // browsers drop downloads fired in the same instant
  }
});
clearBtn.addEventListener('click', () => {
  items = items.filter((i) => ![STATUS.DONE, STATUS.FAILED, STATUS.SKIPPED].includes(i.status));
  render();
});
window.addEventListener('beforeunload', (e) => {
  if (summarize(items).busy) { e.preventDefault(); e.returnValue = ''; }
});

if ('showDirectoryPicker' in window) folderBtn.addEventListener('click', chooseFolder);
else folderBtn.hidden = true;

if (!browserSupported()) {
  unsupportedEl.hidden = false;
  dropzone.disabled = true;
}
// Lets automated tests feed files in without a real drag and drop.
window.__addFiles = addFiles;
window.__state = () => items.map(({ file, blob, ...rest }) => ({ ...rest, hasBlob: Boolean(blob) }));
registerServiceWorker();
render();
