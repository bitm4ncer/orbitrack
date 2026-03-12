/**
 * Cross-tab sync for recordings via BroadcastChannel.
 *
 * When a recording is added/deleted/updated in one tab, a message is posted.
 * Other tabs listen, re-read from IDB, and update Zustand state.
 */

import { useStore } from '../state/store';
import { loadAllRecordings, loadAllFolders, loadRecording } from './recordingStore';

type SyncMessage =
  | { type: 'recording-added'; id: string }
  | { type: 'recording-deleted'; id: string }
  | { type: 'recording-updated'; id: string }
  | { type: 'recordings-reordered' }
  | { type: 'folder-added'; id: string }
  | { type: 'folder-deleted'; id: string }
  | { type: 'folder-updated'; id: string }
  | { type: 'session-ping' }
  | { type: 'session-pong' };

let channel: BroadcastChannel | null = null;

export function postSync(msg: SyncMessage): void {
  channel?.postMessage(msg);
}

export function initRecordingSync(): void {
  if (typeof BroadcastChannel === 'undefined') return;

  channel = new BroadcastChannel('orbitrack-recordings');

  channel.onmessage = async (e: MessageEvent<SyncMessage>) => {
    const msg = e.data;

    switch (msg.type) {
      case 'recording-added': {
        const rec = await loadRecording(msg.id);
        if (rec) {
          useStore.setState((s) => {
            if (s.recordings.some((r) => r.id === rec.id)) return s;
            return { recordings: [...s.recordings, rec] };
          });
        }
        break;
      }

      case 'recording-deleted': {
        useStore.setState((s) => ({
          recordings: s.recordings.filter((r) => r.id !== msg.id),
        }));
        break;
      }

      case 'recording-updated': {
        const rec = await loadRecording(msg.id);
        if (rec) {
          useStore.setState((s) => ({
            recordings: s.recordings.map((r) => (r.id === rec.id ? rec : r)),
          }));
        }
        break;
      }

      case 'recordings-reordered': {
        const all = await loadAllRecordings();
        all.sort((a, b) => a.order - b.order);
        useStore.setState({ recordings: all });
        break;
      }

      case 'folder-added':
      case 'folder-deleted':
      case 'folder-updated': {
        const folders = await loadAllFolders();
        useStore.setState({ recordingFolders: folders });
        break;
      }

      case 'session-ping': {
        // Another tab is asking if anyone is here — respond
        channel?.postMessage({ type: 'session-pong' } satisfies SyncMessage);
        break;
      }

      case 'session-pong':
        // We got a response — our hydration from IDB is already happening
        break;
    }
  };

  // Let other tabs know we're here
  channel.postMessage({ type: 'session-ping' } satisfies SyncMessage);
}
