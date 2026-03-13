/**
 * Extract audio from video URLs using the cobalt.tools API.
 * Supports TikTok, YouTube, SoundCloud, Instagram, Twitter/X, and more.
 */

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  audio?: string;
  audioFilename?: string;
  picker?: { url: string; type: string }[];
  error?: { code: string; context?: Record<string, string> };
}

export interface VideoImportOptions {
  apiEndpoint: string;
  apiKey?: string;
  audioFormat?: 'mp3' | 'ogg' | 'wav' | 'opus' | 'best';
  audioBitrate?: '320' | '256' | '128' | '96' | '64';
  signal?: AbortSignal;
}

export interface VideoImportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

const KNOWN_DOMAINS = [
  'tiktok.com', 'vm.tiktok.com',
  'youtube.com', 'youtu.be', 'music.youtube.com',
  'soundcloud.com',
  'instagram.com',
  'twitter.com', 'x.com',
  'facebook.com', 'fb.watch',
  'vimeo.com',
  'reddit.com',
  'twitch.tv',
  'bilibili.com',
  'dailymotion.com',
  'pinterest.com',
  'tumblr.com',
  'vine.co',
  'streamable.com',
  'rutube.ru',
  'ok.ru',
];

export function isValidVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return KNOWN_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d),
    );
  } catch {
    return false;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  'error.api.link.invalid': 'Invalid or unsupported URL',
  'error.api.link.unsupported': 'This platform is not supported',
  'error.api.fetch.fail': 'Could not fetch the content — it may be private or deleted',
  'error.api.fetch.rate': 'Rate limited — try again in a moment',
  'error.api.youtube.login': 'YouTube requires cookies on the server — see Settings > Sources',
  'error.api.content.video.unavailable': 'Video is unavailable or region-locked',
  'error.api.content.video.live': 'Live streams cannot be downloaded',
  'error.api.content.post.age': 'Age-restricted content cannot be accessed',
};

function humanizeError(code: string): string {
  return ERROR_MESSAGES[code] ?? `Download failed (${code})`;
}

export async function extractAudioFromUrl(
  videoUrl: string,
  options: VideoImportOptions,
): Promise<VideoImportResult> {
  const {
    apiEndpoint,
    apiKey,
    audioFormat = 'mp3',
    audioBitrate = '128',
    signal,
  } = options;

  const endpoint = apiEndpoint.replace(/\/+$/, '');

  console.log(`[url-import] Requesting audio from: ${videoUrl}`);

  // 1. Request audio extraction from cobalt
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Api-Key ${apiKey}`;

  const postController = new AbortController();
  const postTimeout = setTimeout(() => postController.abort(), 60_000); // 60s to allow Render cold start

  // Chain external signal to our controller
  signal?.addEventListener('abort', () => postController.abort(), { once: true });

  let cobaltRes: CobaltResponse;
  try {
    const res = await fetch(`${endpoint}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: videoUrl,
        downloadMode: 'audio',
        audioFormat,
        audioBitrate,
        tiktokFullAudio: true,
      }),
      signal: postController.signal,
    });

    // Cobalt returns JSON error bodies on 400 — parse them for friendly messages
    cobaltRes = await res.json().catch(() => null) as CobaltResponse;
    if (!cobaltRes) {
      console.error(`[url-import] No parseable response (HTTP ${res.status})`);
      throw new Error(`Cobalt API error (${res.status})`);
    }
    console.log(`[url-import] Cobalt response: status=${cobaltRes.status}, filename=${cobaltRes.filename ?? 'n/a'}`);
  } finally {
    clearTimeout(postTimeout);
  }

  // 2. Handle response
  let audioUrl: string | undefined;
  let filename = cobaltRes.filename ?? 'audio';

  switch (cobaltRes.status) {
    case 'tunnel':
    case 'redirect':
      audioUrl = cobaltRes.url;
      break;

    case 'picker':
      // Prefer the audio field if available, otherwise first picker item
      if (cobaltRes.audio) {
        audioUrl = cobaltRes.audio;
        filename = cobaltRes.audioFilename ?? filename;
      } else if (cobaltRes.picker?.[0]) {
        audioUrl = cobaltRes.picker[0].url;
      }
      break;

    case 'error':
      throw new Error(humanizeError(cobaltRes.error?.code ?? 'unknown'));

    default:
      throw new Error(`Unexpected cobalt response: ${cobaltRes.status}`);
  }

  if (!audioUrl) throw new Error('No audio URL returned from cobalt');

  // 3. Download the audio blob
  const dlController = new AbortController();
  const dlTimeout = setTimeout(() => dlController.abort(), 60_000);
  signal?.addEventListener('abort', () => dlController.abort(), { once: true });

  try {
    const dlRes = await fetch(audioUrl, { signal: dlController.signal });
    if (!dlRes.ok) throw new Error(`Audio download failed (${dlRes.status})`);

    const blob = await dlRes.blob();
    console.log(`[url-import] Downloaded ${(blob.size / 1024).toFixed(1)} KiB, type=${blob.type}`);
    const contentType = dlRes.headers.get('content-type') ?? '';
    const mimeType =
      contentType.includes('audio') ? contentType.split(';')[0] :
      audioFormat === 'ogg' ? 'audio/ogg' :
      audioFormat === 'wav' ? 'audio/wav' :
      audioFormat === 'opus' ? 'audio/opus' :
      'audio/mpeg';

    // Clean up filename
    if (!filename.includes('.')) {
      const ext = audioFormat === 'best' ? 'mp3' : audioFormat;
      filename = `${filename}.${ext}`;
    }

    return { blob, filename, mimeType };
  } finally {
    clearTimeout(dlTimeout);
  }
}

/** Quick health check — returns true if endpoint responds */
export async function testCobaltConnection(
  apiEndpoint: string,
  apiKey?: string,
): Promise<boolean> {
  try {
    const endpoint = apiEndpoint.replace(/\/+$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Api-Key ${apiKey}`;

    const res = await fetch(`${endpoint}/`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok || res.status === 405; // GET not allowed is fine, means it's a cobalt instance
  } catch {
    return false;
  }
}
