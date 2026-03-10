/**
 * IndexedDB persistence for recordings and recording folders.
 * Blobs are stored natively in IDB (no base64 overhead).
 */

import { getAll, get, put, del } from './idb';
import type { RecordingFormat } from '../audio/recorder';

export interface StoredRecording {
  id: string;
  blob: Blob;
  name: string;
  duration: number;
  timestamp: number;
  folderId: string | null;
  format: RecordingFormat;
  order: number;
}

export interface StoredFolder {
  id: string;
  name: string;
}

// ── Recordings ────────────────────────────────────────────────────────────────

export function loadAllRecordings(): Promise<StoredRecording[]> {
  return getAll<StoredRecording>('recordings');
}

export function loadRecording(id: string): Promise<StoredRecording | undefined> {
  return get<StoredRecording>('recordings', id);
}

export function saveRecording(rec: StoredRecording): Promise<void> {
  return put('recordings', rec);
}

export function deleteRecordingFromDB(id: string): Promise<void> {
  return del('recordings', id);
}

// ── Folders ───────────────────────────────────────────────────────────────────

export function loadAllFolders(): Promise<StoredFolder[]> {
  return getAll<StoredFolder>('recordingFolders');
}

export function saveFolder(folder: StoredFolder): Promise<void> {
  return put('recordingFolders', folder);
}

export function deleteFolderFromDB(id: string): Promise<void> {
  return del('recordingFolders', id);
}
