import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export interface SampleEntry {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: SampleEntry[];
}

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff']);

function readSampleDir(dirPath: string, urlPrefix: string): SampleEntry[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result: SampleEntry[] = [];

  // Folders first, then files, alphabetical within each group
  const folders = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const folder of folders) {
    const children = readSampleDir(path.join(dirPath, folder.name), `${urlPrefix}/${folder.name}`);
    if (children.length > 0) {
      result.push({ name: folder.name, path: `${urlPrefix}/${folder.name}`, type: 'folder', children });
    }
  }

  for (const file of files) {
    result.push({ name: file.name, path: `${urlPrefix}/${file.name}`, type: 'file' });
  }

  return result;
}

function mergeTrees(a: SampleEntry[], b: SampleEntry[]): SampleEntry[] {
  const map = new Map<string, SampleEntry>();
  for (const entry of a) map.set(entry.name, entry);
  for (const entry of b) {
    const existing = map.get(entry.name);
    if (existing && existing.type === 'folder' && entry.type === 'folder') {
      existing.children = mergeTrees(existing.children || [], entry.children || []);
    } else {
      map.set(entry.name, entry);
    }
  }
  const result = [...map.values()];
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

const MIME_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
};

export function sampleListPlugin(): Plugin {
  let publicDir: string;
  let rootDir: string;

  return {
    name: 'sample-list',
    configResolved(config) {
      publicDir = config.publicDir;
      rootDir = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // API: list sample tree
        if (url === '/api/samples') {
          const publicSamples = path.join(publicDir, 'samples');
          const rootSamples = path.join(rootDir, 'samples');

          const publicTree = readSampleDir(publicSamples, '/samples');
          const rootTree = readSampleDir(rootSamples, '/samples');
          const merged = mergeTrees(publicTree, rootTree);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(merged));
          return;
        }

        // Serve sample files from root /samples/ dir (public/ is already handled by Vite)
        if (url.startsWith('/samples/')) {
          const decodedPath = decodeURIComponent(url);
          const relativePath = decodedPath.slice('/samples/'.length);
          // Try root samples dir first (for sample packs not in public/)
          const rootFile = path.join(rootDir, 'samples', relativePath);
          if (fs.existsSync(rootFile) && fs.statSync(rootFile).isFile()) {
            const ext = path.extname(rootFile).toLowerCase();
            const mime = MIME_TYPES[ext];
            if (mime) {
              res.setHeader('Content-Type', mime);
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(rootFile).pipe(res);
              return;
            }
          }
        }

        next();
      });
    },
  };
}
