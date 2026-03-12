/**
 * Cobalt API settings stored in localStorage.
 * Used for URL-based audio extraction (TikTok, YouTube, SoundCloud, etc.)
 */

const COBALT_ENDPOINT_KEY = 'orbeat_cobalt_endpoint';
const COBALT_API_KEY_KEY = 'orbeat_cobalt_api_key';

const DEFAULT_ENDPOINT = 'https://cobalt.orbeat.app';

export function getCobaltEndpoint(): string {
  try {
    return localStorage.getItem(COBALT_ENDPOINT_KEY) || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function setCobaltEndpoint(url: string): void {
  try {
    if (url && url !== DEFAULT_ENDPOINT) {
      localStorage.setItem(COBALT_ENDPOINT_KEY, url);
    } else {
      localStorage.removeItem(COBALT_ENDPOINT_KEY);
    }
  } catch {
    console.warn('Could not store cobalt endpoint in localStorage');
  }
}

export function getCobaltApiKey(): string {
  try {
    return localStorage.getItem(COBALT_API_KEY_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCobaltApiKey(key: string): void {
  try {
    if (key) {
      localStorage.setItem(COBALT_API_KEY_KEY, key);
    } else {
      localStorage.removeItem(COBALT_API_KEY_KEY);
    }
  } catch {
    console.warn('Could not store cobalt API key in localStorage');
  }
}

export { DEFAULT_ENDPOINT };
