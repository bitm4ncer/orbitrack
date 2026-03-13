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

const MIME_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
};

export function sampleListPlugin(): Plugin {
  let rootDir: string;
  // Normalised base without trailing slash: '/orbitrack/' → '/orbitrack', '/' → ''
  let basePath: string;

  return {
    name: 'sample-list',
    configResolved(config) {
      rootDir = config.root;
      const b = config.base ?? '/';
      basePath = b.endsWith('/') ? b.slice(0, -1) : b;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip base prefix so path checks work regardless of base setting
        const raw = req.url || '';
        const url = basePath && raw.startsWith(basePath) ? raw.slice(basePath.length) : raw;

        // Serve sample tree JSON
        if (url === '/samples.json' || url === '/api/samples') {
          const rootSamples = path.join(rootDir, 'samples');
          const publicDir = path.join(rootDir, 'public');
          let json: string;
          if (fs.existsSync(rootSamples) && fs.readdirSync(rootSamples).length > 0) {
            json = JSON.stringify(readSampleDir(rootSamples, 'samples'));
          } else {
            // No local samples dir — serve committed manifest from public/
            const fallback = path.join(publicDir, 'samples.json');
            json = fs.existsSync(fallback) ? fs.readFileSync(fallback, 'utf-8') : '[]';
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(json);
          return;
        }

        // Serve individual sample files from root samples/
        if (url.startsWith('/samples/')) {
          const relativePath = decodeURIComponent(url.slice('/samples/'.length));
          const file = path.join(rootDir, 'samples', relativePath);
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const ext = path.extname(file).toLowerCase();
            const mime = MIME_TYPES[ext];
            if (mime) {
              res.setHeader('Content-Type', mime);
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(file).pipe(res);
              return;
            }
          }
        }

        // Serve loop tree JSON
        if (url === '/loops.json' || url === '/api/loops') {
          const rootLoops = path.join(rootDir, 'loops');
          const publicDir = path.join(rootDir, 'public');
          let json: string;
          if (fs.existsSync(rootLoops) && fs.readdirSync(rootLoops).length > 0) {
            json = JSON.stringify(readSampleDir(rootLoops, 'loops'));
          } else {
            const fallback = path.join(publicDir, 'loops.json');
            json = fs.existsSync(fallback) ? fs.readFileSync(fallback, 'utf-8') : '[]';
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(json);
          return;
        }

        // Serve individual loop files from root loops/
        if (url.startsWith('/loops/')) {
          const relativePath = decodeURIComponent(url.slice('/loops/'.length));
          const file = path.join(rootDir, 'loops', relativePath);
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const ext = path.extname(file).toLowerCase();
            const mime = MIME_TYPES[ext];
            if (mime) {
              res.setHeader('Content-Type', mime);
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(file).pipe(res);
              return;
            }
          }
        }

        next();
      });
    },
    generateBundle() {
      const publicDir = path.join(rootDir, 'public');

      // Emit committed manifests from public/ — audio files are served from R2 CDN.
      const sampleJson = fs.readFileSync(path.join(publicDir, 'samples.json'), 'utf-8');
      this.emitFile({ type: 'asset', fileName: 'samples.json', source: sampleJson });

      const loopJson = fs.readFileSync(path.join(publicDir, 'loops.json'), 'utf-8');
      this.emitFile({ type: 'asset', fileName: 'loops.json', source: loopJson });
    },
  };
}
