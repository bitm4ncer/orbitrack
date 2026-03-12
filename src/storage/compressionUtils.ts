/**
 * Shared gzip / base64url compression helpers.
 * Used by urlShare.ts (URL encoding) and version history (snapshot storage).
 */

import { gzip, gunzip, strToU8, strFromU8 } from 'fflate';

export { strToU8, strFromU8 };

export function gzipAsync(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((res, rej) => gzip(data, (err, out) => (err ? rej(err) : res(out))));
}

export function gunzipAsync(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((res, rej) => gunzip(data, (err: any, out: Uint8Array) => (err ? rej(err) : res(out))));
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const mod4 = padded.length % 4;
  const repadded = mod4 ? padded + '===='.slice(mod4) : padded;
  const bin = atob(repadded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
