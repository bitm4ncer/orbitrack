/**
 * Thin promise wrapper around the native IndexedDB API.
 * No external dependencies.
 */

const DB_NAME = 'orbeat-db';
const DB_VERSION = 2;

let cachedDB: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('presets')) {
        const ps = db.createObjectStore('presets', { keyPath: 'id' });
        ps.createIndex('folder', 'folder', { unique: false });
        ps.createIndex('source', 'source', { unique: false });
        ps.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('sets')) {
        const ss = db.createObjectStore('sets', { keyPath: 'id' });
        ss.createIndex('name', 'meta.name', { unique: false });
        ss.createIndex('updatedAt', 'meta.updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('samples')) {
        const sa = db.createObjectStore('samples', { keyPath: 'key' });
        sa.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('recordings')) {
        const rs = db.createObjectStore('recordings', { keyPath: 'id' });
        rs.createIndex('folderId', 'folderId', { unique: false });
        rs.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('recordingFolders')) {
        db.createObjectStore('recordingFolders', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      cachedDB = req.result;
      cachedDB.onclose = () => { cachedDB = null; };
      resolve(cachedDB);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const idx = store.index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}
