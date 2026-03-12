/**
 * LLM API key storage using localStorage only.
 * Keys are NEVER persisted to Zustand state or IndexedDB.
 */

const API_KEY_STORAGE_KEY = 'orbitrack_llm_api_key';

export function getLLMApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
    return '';
  }
}

export function setLLMApiKey(key: string): void {
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable
    console.warn('Could not store API key in localStorage');
  }
}

export function clearLLMApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}
