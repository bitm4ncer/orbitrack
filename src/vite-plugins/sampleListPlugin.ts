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

function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
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
  let outDir: string;
  let isBuild: boolean;
  // Normalised base without trailing slash: '/Orbeat/' → '/Orbeat', '/' → ''
  let basePath: string;

  return {
    name: 'sample-list',
    configResolved(config) {
      rootDir = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
      const b = config.base ?? '/';
      basePath = b.endsWith('/') ? b.slice(0, -1) : b;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip base prefix so path checks work regardless of base setting
        const raw = req.url || '';
        const url = basePath && raw.startsWith(basePath) ? raw.slice(basePath.length) : raw;

        // Serve sample tree JSON — only from root samples/ folder
        if (url === '/samples.json' || url === '/api/samples') {
          const rootSamples = path.join(rootDir, 'samples');
          const tree = readSampleDir(rootSamples, 'samples');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(tree));
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

        // Serve loop tree JSON — from root loops/ folder
        if (url === '/loops.json' || url === '/api/loops') {
          const rootLoops = path.join(rootDir, 'loops');
          const tree = readSampleDir(rootLoops, 'loops');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(tree));
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
      // Emit samples.json from root samples/ only (no public/samples/ merge)
      const rootSamples = path.join(rootDir, 'samples');
      const sampleTree = readSampleDir(rootSamples, 'samples');
      this.emitFile({
        type: 'asset',
        fileName: 'samples.json',
        source: JSON.stringify(sampleTree),
      });

      // Emit loops.json from root loops/
      const rootLoops = path.join(rootDir, 'loops');
      const loopTree = readSampleDir(rootLoops, 'loops');
      this.emitFile({
        type: 'asset',
        fileName: 'loops.json',
        source: JSON.stringify(loopTree),
      });
    },
    closeBundle() {
      if (!isBuild) return;
      // Copy root samples/ into dist/samples/
      const rootSamples = path.join(rootDir, 'samples');
      const distSamples = path.join(outDir, 'samples');
      copyDirSync(rootSamples, distSamples);

      // Copy root loops/ into dist/loops/
      const rootLoops = path.join(rootDir, 'loops');
      const distLoops = path.join(outDir, 'loops');
      copyDirSync(rootLoops, distLoops);
    },
  };
}
