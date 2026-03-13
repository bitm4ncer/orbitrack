#!/usr/bin/env node
// Sync local samples/ and loops/ directories to Cloudflare R2 bucket.
// Usage: node scripts/sync-r2.mjs

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '8c9e58ef4cd8f833efd12344d7aa8b88';
const BUCKET = process.env.R2_BUCKET || 'samples';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables.');
  process.exit(1);
}

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff']);

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

function collectFiles(dir, prefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const key = prefix + '/' + entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, key));
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push({ localPath: fullPath, key });
    }
  }
  return results;
}

async function listRemoteKeys(prefix) {
  const keys = new Set();
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    for (const obj of res.Contents ?? []) keys.add(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function deleteKeys(keys) {
  const batch = keys.map(k => ({ Key: k }));
  while (batch.length) {
    const chunk = batch.splice(0, 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET, Delete: { Objects: chunk },
    }));
  }
}

const MIME_TYPES = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff',
};

async function uploadFile(localPath, key) {
  const ext = path.extname(localPath).toLowerCase();
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fs.readFileSync(localPath),
    ContentType: MIME_TYPES[ext] || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function syncDir(localDir, remotePrefix) {
  console.log(`\nScanning ${localDir} → ${remotePrefix}/...`);
  const files = collectFiles(localDir, remotePrefix);
  console.log(`  Found ${files.length} audio files locally`);

  const remoteKeys = await listRemoteKeys(remotePrefix + '/');
  console.log(`  Found ${remoteKeys.size} files on R2`);

  // Delete old keys from wrong prefix (sampler/ or looper/)
  const localKeySet = new Set(files.map(f => f.key));
  const toUpload = files.filter(f => !remoteKeys.has(f.key));
  const staleKeys = [...remoteKeys].filter(k => !localKeySet.has(k));

  if (staleKeys.length > 0) {
    console.log(`  Deleting ${staleKeys.length} stale files from R2...`);
    await deleteKeys(staleKeys);
  }

  console.log(`  Uploading ${toUpload.length} new files...`);
  let done = 0;
  for (const file of toUpload) {
    await uploadFile(file.localPath, file.key);
    done++;
    if (done % 20 === 0 || done === toUpload.length) {
      process.stdout.write(`\r  Progress: ${done}/${toUpload.length}`);
    }
  }
  if (toUpload.length > 0) console.log();
  console.log(`  Done: ${remotePrefix}/`);
}

// Also clean up old sampler/ and looper/ prefixes
async function cleanOldPrefixes() {
  for (const old of ['sampler/', 'looper/']) {
    const keys = await listRemoteKeys(old);
    if (keys.size > 0) {
      console.log(`\nCleaning old prefix "${old}" (${keys.size} files)...`);
      await deleteKeys([...keys]);
    }
  }
}

// Accept optional source root as CLI arg (defaults to project root)
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, '..');
console.log(`Source root: ${root}`);
await syncDir(path.join(root, 'samples'), 'samples');
await syncDir(path.join(root, 'loops'), 'loops');
await cleanOldPrefixes();
console.log('\nAll done!');
