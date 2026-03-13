/**
 * LogConsole — terminal-style diagnostic console panel.
 * Virtual-scrolled, filterable, with download/snapshot controls.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { log, type LogEntry, type LogLevel } from '../../logging/logger';
import { useStore } from '../../state/store';

const ROW_HEIGHT = 24;
const OVERSCAN = 20;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6366f1',
  info: '#22d3ee',
  warn: '#fbbf24',
  error: '#ef4444',
  perf: '#a78bfa',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'rgba(99,102,241,0.08)',
  info: 'rgba(34,211,238,0.06)',
  warn: 'rgba(251,191,36,0.08)',
  error: 'rgba(239,68,68,0.1)',
  perf: 'rgba(167,139,250,0.08)',
};

function durationColor(ms: number): string {
  if (ms < 1) return '#4ade80';
  if (ms < 5) return '#fbbf24';
  return '#ef4444';
}

export function LogConsole() {
  const setShowLogConsole = useStore((s) => s.setShowLogConsole);
  const [entries, setEntries] = useState<LogEntry[]>(() => log.getEntries());
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [levelFilter, setLevelFilter] = useState<Record<LogLevel, boolean>>({
    debug: true, info: true, warn: true, error: true, perf: true,
  });
  const [moduleFilter, setModuleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const batchRef = useRef<LogEntry[]>([]);
  const rafRef = useRef(0);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ y: 0, h: 0 });

  // Subscribe to logger and batch updates at ~10Hz
  useEffect(() => {
    const flush = () => {
      if (batchRef.current.length > 0) {
        setEntries(log.getEntries());
        batchRef.current = [];
      }
    };
    const unsub = log.subscribe((entry) => {
      if (!entry) {
        // clear signal
        setEntries([]);
        setExpandedIds(new Set());
        return;
      }
      batchRef.current.push(entry);
    });
    const iv = setInterval(flush, 100);
    return () => { unsub(); clearInterval(iv); cancelAnimationFrame(rafRef.current); };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Detect user scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 2;
    setAutoScroll(atBottom);
  }, []);

  // Filter entries
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (!levelFilter[e.level]) return false;
      if (moduleFilter && e.module !== moduleFilter) return false;
      if (search && !e.message.toLowerCase().includes(search.toLowerCase()) && !e.module.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, levelFilter, moduleFilter, search]);

  // Virtual scroll
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = height - 40; // toolbar height
  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleEntries = filtered.slice(startIdx, endIdx);

  const onContainerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    handleScroll();
  }, [handleScroll]);

  // Module list
  const modules = useMemo(() => log.getModules(), [entries]);

  // Resize
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartRef.current = { y: e.clientY, h: height };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = resizeStartRef.current.y - ev.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartRef.current.h + delta)));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height]);

  const toggleLevel = (level: LogLevel) => {
    setLevelFilter((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        height,
        background: 'rgba(5, 5, 12, 0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 11,
      }}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize flex items-center justify-center group hover:bg-accent/10 shrink-0"
        onMouseDown={onResizeDown}
      >
        <div className="w-10 h-0.5 rounded-full bg-white/10 group-hover:bg-accent/40 transition-colors" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1 shrink-0 border-b border-white/5" style={{ minHeight: 32 }}>
        {/* Level filters */}
        <div className="flex gap-0.5">
          {(Object.keys(LEVEL_COLORS) as LogLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer"
              style={{
                color: levelFilter[level] ? LEVEL_COLORS[level] : 'rgba(255,255,255,0.15)',
                background: levelFilter[level] ? `${LEVEL_COLORS[level]}15` : 'transparent',
                border: `1px solid ${levelFilter[level] ? `${LEVEL_COLORS[level]}30` : 'transparent'}`,
              }}
            >
              {level === 'perf' ? 'PERF' : level.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </div>

        {/* Module filter */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-transparent border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/60 outline-none cursor-pointer"
          style={{ maxWidth: 100 }}
        >
          <option value="">all modules</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search..."
          className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white/70 outline-none placeholder:text-white/20 flex-1"
          style={{ minWidth: 60, maxWidth: 180 }}
        />

        <div className="flex-1" />

        {/* Entry count */}
        <span className="text-[10px] text-white/20">
          {filtered.length} / {entries.length}
        </span>

        {/* Actions */}
        <button
          onClick={() => log.takePerformanceSnapshot()}
          className="px-1.5 py-0.5 rounded text-[10px] text-[#a78bfa] bg-[#a78bfa]/10 border border-[#a78bfa]/20 hover:bg-[#a78bfa]/20 transition-colors cursor-pointer"
          title="Take performance snapshot"
        >
          SNAP
        </button>
        <button
          onClick={() => log.downloadAsJSON()}
          className="px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
          title="Download as JSON"
        >
          JSON
        </button>
        <button
          onClick={() => log.downloadAsText()}
          className="px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
          title="Download as TXT"
        >
          TXT
        </button>
        <button
          onClick={() => { log.clear(); }}
          className="px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-red-400/70 border border-white/10 hover:border-red-400/30 transition-colors cursor-pointer"
          title="Clear logs"
        >
          CLR
        </button>
        <button
          onClick={() => setShowLogConsole(false)}
          className="px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
          title="Close console"
        >
          ✕
        </button>
      </div>

      {/* Log entries — virtual scroll */}
      <div
        ref={scrollRef}
        onScroll={onContainerScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
            {visibleEntries.map((entry) => {
              const isExpanded = expandedIds.has(entry.id);
              const hasData = entry.data !== undefined && entry.data !== null;
              const isMultiline = entry.message.includes('\n');

              return (
                <div key={entry.id}>
                  <div
                    className="flex items-center gap-2 px-3 transition-colors"
                    style={{
                      height: ROW_HEIGHT,
                      background: hasData || isMultiline ? 'rgba(255,255,255,0.015)' : 'transparent',
                      cursor: hasData || isMultiline ? 'pointer' : 'default',
                      borderLeft: `2px solid ${LEVEL_COLORS[entry.level]}20`,
                    }}
                    onClick={() => (hasData || isMultiline) && toggleExpand(entry.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = hasData || isMultiline ? 'rgba(255,255,255,0.015)' : 'transparent'; }}
                  >
                    {/* Timestamp */}
                    <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.2)', width: 80 }}>
                      {entry.wallTime}
                    </span>

                    {/* Level badge */}
                    <span
                      className="shrink-0 text-[9px] font-bold uppercase text-center rounded"
                      style={{
                        color: LEVEL_COLORS[entry.level],
                        background: LEVEL_BG[entry.level],
                        width: 36,
                        padding: '1px 0',
                      }}
                    >
                      {entry.level === 'debug' ? 'DBG' : entry.level === 'perf' ? 'PERF' : entry.level.toUpperCase()}
                    </span>

                    {/* Module */}
                    <span
                      className="shrink-0 text-[10px] rounded px-1.5 py-0.5"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.45)',
                        maxWidth: 90,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.module}
                    </span>

                    {/* Message (first line) */}
                    <span
                      className="flex-1 truncate"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                    >
                      {isMultiline ? entry.message.split('\n')[0] : entry.message}
                    </span>

                    {/* Duration */}
                    {entry.durationMs !== undefined && entry.durationMs > 0 && (
                      <span
                        className="shrink-0 text-[10px] font-mono"
                        style={{ color: durationColor(entry.durationMs) }}
                      >
                        {entry.durationMs.toFixed(2)}ms
                      </span>
                    )}

                    {/* Expand indicator */}
                    {(hasData || isMultiline) && (
                      <span className="shrink-0 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {isExpanded ? '▾' : '▸'}
                      </span>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div
                      className="px-3 py-2 ml-[82px]"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderLeft: `2px solid ${LEVEL_COLORS[entry.level]}30`,
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {isMultiline && (
                        <pre className="whitespace-pre-wrap mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {entry.message}
                        </pre>
                      )}
                      {hasData && (
                        <pre className="whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {JSON.stringify(entry.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-3 shrink-0 border-t border-white/5"
        style={{ height: 20, color: 'rgba(255,255,255,0.2)', fontSize: 10 }}
      >
        <span>
          {autoScroll ? '⬇ auto-scroll' : '⏸ scroll paused — scroll to bottom to resume'}
        </span>
        <span>
          buf {log.getCount().toLocaleString()} / 5,000
        </span>
      </div>
    </div>
  );
}
