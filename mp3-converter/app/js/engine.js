// Conversion engine. Reads the MP4 in pieces, decodes only the audio track with the
// browser's built-in decoder, and encodes MP3 with a bundled LAME encoder (WebAssembly).
// The video track is never read into memory. Nothing here touches the network.
import {
  Input, Output, Conversion, BlobSource, BufferTarget, Mp3OutputFormat,
  MP4, QTFF, canEncodeAudio, ConversionCanceledError,
} from '../vendor/mediabunny.min.mjs';
import { registerMp3Encoder } from '../vendor/mediabunny-mp3-encoder.min.mjs';

export const BITRATE = 192_000;

export class ConvertError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

let encoderReady = null;
function ensureEncoder() {
  if (!encoderReady) {
    encoderReady = (async () => {
      if (!(await canEncodeAudio('mp3'))) registerMp3Encoder();
    })();
  }
  return encoderReady;
}

export function browserSupported() {
  return typeof AudioDecoder === 'function' && typeof AudioData === 'function';
}

/**
 * Converts one MP4 File to an MP3 Blob.
 * @param {File} file
 * @param {{onProgress?: (fraction:number)=>void}} [opts]
 * @returns {{promise: Promise<Blob>, cancel: () => void}}
 */
export function convert(file, opts = {}) {
  let conversion = null;
  let canceled = false;
  let input = null;

  const promise = (async () => {
    await ensureEncoder();
    input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF] });
    try {
      let audioTrack;
      try {
        audioTrack = await input.getPrimaryAudioTrack();
      } catch (err) {
        throw new ConvertError('This file could not be read. It may be damaged or not a real MP4.', 'unreadable');
      }
      if (!audioTrack) {
        throw new ConvertError('This file has no audio track, so there is nothing to convert.', 'no_audio');
      }
      const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() });
      conversion = await Conversion.init({
        input, output,
        video: { discard: true },
        audio: { bitrate: BITRATE, codec: 'mp3', forceTranscode: true },
        showWarnings: false,
      });
      if (canceled) throw new ConvertError('Canceled.', 'canceled');
      if (!conversion.isValid) {
        const reasons = conversion.discardedTracks.map((d) => d.reason);
        if (reasons.includes('undecodable_source_codec') || reasons.includes('unknown_source_codec')) {
          throw new ConvertError('The audio in this file is in a format this browser cannot read.', 'undecodable');
        }
        throw new ConvertError('This file could not be converted.', 'invalid');
      }
      if (opts.onProgress) conversion.onProgress = (p) => opts.onProgress(Math.min(1, Math.max(0, p)));
      await conversion.execute();
      const buffer = output.target.buffer;
      if (!buffer || buffer.byteLength === 0) {
        throw new ConvertError('This file has no audio track, so there is nothing to convert.', 'no_audio');
      }
      return new Blob([buffer], { type: 'audio/mpeg' });
    } catch (err) {
      if (err instanceof ConvertError) throw err;
      if (canceled || err instanceof ConversionCanceledError) throw new ConvertError('Canceled.', 'canceled');
      console.error(err);
      throw new ConvertError('This file could not be converted. It may be damaged.', 'failed');
    } finally {
      try { input.dispose(); } catch { /* already disposed */ }
    }
  })();

  return {
    promise,
    cancel() {
      canceled = true;
      if (conversion) conversion.cancel().catch(() => {});
    },
  };
}
