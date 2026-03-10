import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `handler` when a click occurs outside the element referenced by `ref`.
 * Uses capture-phase mousedown for immediate detection.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
): void {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      savedHandler.current();
    };
    document.addEventListener('mousedown', listener, true);
    return () => document.removeEventListener('mousedown', listener, true);
  }, [ref]);
}
