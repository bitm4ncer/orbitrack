import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { serializeSet, deserializeSet, sampleToBase64 } from './serializer';
import { gzipAsync, gunzipAsync, toBase64Url, fromBase64Url } from './compressionUtils';
import type { OrbeatSet } from '../types/storage';

// ── Types ────────────────────────────────────────────────────────────────────

interface SampleManifest {
  entries: { key: string; name: string; mimeType: string; filename: string }[];
}

export interface EncodeResult {
  encoded: string;
  hasCustomSamples: boolean;
}

export interface ImportedSample {
  key: string;
  name: string;
  url: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((res, rej) => zip(files, {}, (err: any, out: Uint8Array) => (err ? rej(err) : res(out))));
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((res, rej) => unzip(data, (err: any, out: Record<string, Uint8Array>) => (err ? rej(err) : res(out))));
}

// ── URL Encode/Decode ────────────────────────────────────────────────────────

/**
 * Encode a serializable state into a gzip-compressed, base64url-encoded string.
 * Custom samples are excluded from the URL (embedSamples: false) to keep the hash short.
 */
export async function encodeSetToUrl(
  state: Parameters<typeof serializeSet>[0],
  projectName?: string,
  thumbnail?: string,
): Promise<EncodeResult> {
  const hasCustomSamples = state.customSamples.length > 0;

  const set = await serializeSet(state, {
    name: projectName || 'Shared Track',
    embedSamples: false,
    includeInstruments: true,
    includeEffects: true,
    includeSynthParams: true,
  });

  if (thumbnail) set.meta.thumbnail = thumbnail;

  const json = JSON.stringify(set);
  const data = strToU8(json);
  const compressed = await gzipAsync(data);
  return {
    encoded: toBase64Url(compressed),
    hasCustomSamples,
  };
}

/**
 * Decode a base64url-encoded, gzip-compressed string back into an OrbeatSet.
 */
export async function decodeSetFromUrl(encoded: string): Promise<OrbeatSet> {
  const compressed = fromBase64Url(encoded);
  const decompressed = await gunzipAsync(compressed);
  const json = strFromU8(decompressed);
  return deserializeSet(JSON.parse(json));
}

/**
 * Build a full shareable URL with the encoded set in the hash.
 */
export function buildShareUrl(encoded: string): string {
  const url = new URL(window.location.href);
  url.hash = `set=${encoded}`;
  return url.toString();
}

/**
 * Parse the share hash from window.location.hash.
 * Returns the payload after `#set=` or null if not present.
 */
export function parseShareHash(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#set=')) return null;
  return hash.slice(5);
}

// ── ZIP Export/Import (Custom Samples Only) ──────────────────────────────────

/**
 * Export all custom samples into a ZIP file.
 * Each sample is stored with a manifest.json that maps keys to filenames.
 */
export async function exportSamplesZip(
  customSamples: { key: string; url: string; name: string }[]
): Promise<Blob> {
  if (customSamples.length === 0) {
    // Empty ZIP with just a manifest
    const manifest: SampleManifest = { entries: [] };
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    };
    const zipped = await zipAsync(files);
    return new Blob([zipped as BlobPart], { type: 'application/zip' });
  }

  const files: Record<string, Uint8Array> = {};
  const manifest: SampleManifest = { entries: [] };

  for (const sample of customSamples) {
    const { base64, mimeType } = await sampleToBase64(sample.url);
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'wav';
    const safeKey = sample.key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `samples/${safeKey}.${ext}`;

    // Convert base64 to Uint8Array
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    files[filename] = bytes as Uint8Array;

    manifest.entries.push({
      key: sample.key,
      name: sample.name,
      mimeType,
      filename,
    });
  }

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = await zipAsync(files);
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

/**
 * Import custom samples from a ZIP file.
 * Expects a manifest.json at the root with entries mapping keys to audio files.
 */
export async function importSamplesZip(file: File): Promise<ImportedSample[]> {
  const arrayBuffer = await file.arrayBuffer();
  const unzipped = await unzipAsync(new Uint8Array(arrayBuffer));

  const manifestRaw = unzipped['manifest.json'];
  if (!manifestRaw) {
    throw new Error('Invalid samples ZIP: missing manifest.json');
  }

  const manifest: SampleManifest = JSON.parse(strFromU8(manifestRaw));

  return manifest.entries.map(({ key, name, mimeType, filename }) => {
    const bytes = unzipped[filename];
    if (!bytes) {
      throw new Error(`Missing file in ZIP: ${filename}`);
    }
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    return {
      key,
      name,
      url: URL.createObjectURL(blob),
    };
  });
}
