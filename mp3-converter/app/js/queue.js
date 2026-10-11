// Pure queue logic. No DOM, no browser APIs, so it can be unit tested in Node.
export const STATUS = Object.freeze({
  WAITING: 'waiting', CONVERTING: 'converting', DONE: 'done',
  FAILED: 'failed', SKIPPED: 'skipped',
});

export const MAX_BYTES = 2 * 1024 * 1024 * 1024; // about 2 GB per file, by design

export function isMp4(file) {
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.mp4') || name.endsWith('.m4v') || file.type === 'video/mp4';
}

/** Returns null when the file can be queued, or a plain-English reason when it cannot. */
export function rejectReason(file) {
  if (!isMp4(file)) return 'Not an MP4. This app only converts MP4 files.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BYTES) return 'This file is over 2 GB, which is more than this app can handle.';
  return null;
}

export function mp3Name(name) {
  const base = String(name).replace(/\.(mp4|m4v)$/i, '');
  // Characters Windows will not accept in a file name.
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
  return (safe || 'audio') + '.mp3';
}

/** Picks a name not already in `taken` (a Set of lower-cased names): "a.mp3", "a (2).mp3", ... */
export function uniqueName(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  const base = name.replace(/\.mp3$/i, '');
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n}).mp3`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  if (bytes >= 1024 ** 2) return Math.round(bytes / 1024 ** 2) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' bytes';
}

export function formatRemaining(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '';
  if (seconds < 50) return 'less than a minute left';
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

let nextId = 1;
export function makeItem(file) {
  const reason = rejectReason(file);
  return {
    id: nextId++, file, name: file.name, size: file.size,
    status: reason ? STATUS.SKIPPED : STATUS.WAITING,
    error: reason, progress: 0, startedAt: 0,
    outName: null, outSize: 0, blob: null, savedToFolder: false,
  };
}

export function nextWaiting(items) {
  return items.find((i) => i.status === STATUS.WAITING) || null;
}

/** Batch numbers for the queue header. Skipped files are not part of the batch. */
export function summarize(items) {
  const inBatch = items.filter((i) => i.status !== STATUS.SKIPPED);
  const done = inBatch.filter((i) => i.status === STATUS.DONE).length;
  const failed = inBatch.filter((i) => i.status === STATUS.FAILED).length;
  const active = inBatch.find((i) => i.status === STATUS.CONVERTING) || null;
  const waiting = inBatch.filter((i) => i.status === STATUS.WAITING).length;
  const totalBytes = inBatch.reduce((s, i) => s + i.size, 0);
  const doneBytes = inBatch.reduce((s, i) => {
    if (i.status === STATUS.DONE || i.status === STATUS.FAILED) return s + i.size;
    if (i.status === STATUS.CONVERTING) return s + i.size * i.progress;
    return s;
  }, 0);
  return {
    total: inBatch.length, done, failed, waiting, active,
    busy: Boolean(active) || waiting > 0,
    fraction: totalBytes ? doneBytes / totalBytes : 0,
    remainingBytes: totalBytes - doneBytes,
  };
}
