'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileJson, Upload, Loader2, RefreshCw, Search, SlidersHorizontal,
  Download, ChevronUp, ChevronDown, ChevronsUpDown, LayoutGrid,
  Table2, X, Package, TrendingUp, Hash, Layers, AlertTriangle,
  ChevronDown as ChevDown, FileSpreadsheet,
} from 'lucide-react';
import { THEME_COLOR, APP_TITLE, CURRENCY_LOCALE, CURRENCY_SYMBOL, DEFAULT_PAGE_SIZE } from '@/config/settings.config';

// ── Types ────────────────────────────────────────────────────
interface JsonFileMeta {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  displayName: string;
}

interface ParsedMeta {
  originalName: string;
  sourceUrl: string;
  sheets: string[];
  totalRows: number;
  columns: string[];
  convertedAt: string;
}

type Row = Record<string, string | number | boolean | null>;
type SortDir = 'asc' | 'desc' | null;

// ── Helpers ──────────────────────────────────────────────────
const formatINR = (val: number) =>
  CURRENCY_SYMBOL + new Intl.NumberFormat(CURRENCY_LOCALE, { maximumFractionDigits: 2 }).format(val);

function isMonetary(k: string) { return /price|cost|amount|value|mrp|rate|revenue|sales|total/i.test(k); }
function isStock(k: string)    { return /stock|qty|quantity|units|count|inventory/i.test(k); }
function isCat(k: string)      { return /category|type|group|class|dept|department|segment/i.test(k); }

function detectCols(cols: string[]) {
  return {
    name:     cols.find((c) => /^name|product|item|sku|title/i.test(c)) ?? cols[0],
    stock:    cols.find(isStock),
    price:    cols.find(isMonetary),
    category: cols.find(isCat),
  };
}

function stockBadge(val: number | null) {
  if (val === null) return <span className="badge badge-slate">N/A</span>;
  if (val <= 0)     return <span className="badge badge-red">Out</span>;
  if (val < 20)     return <span className="badge badge-amber">Low·{val}</span>;
  return <span className="badge badge-teal">{val}</span>;
}

function toCSV(rows: Row[], columns: string[]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [columns.map(esc).join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Stat Card ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
        <p className="font-display text-xl font-bold text-slate-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function DashboardPage() {
  const [jsonFiles, setJsonFiles]     = useState<JsonFileMeta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected]       = useState<JsonFileMeta | null>(null);
  const [meta, setMeta]               = useState<ParsedMeta | null>(null);
  const [allData, setAllData]         = useState<Row[]>([]);
  const [columns, setColumns]         = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError]     = useState('');
  const [dropOpen, setDropOpen]       = useState(false);

  // Filters
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [activeSheet, setActiveSheet] = useState('All');
  const [sortCol, setSortCol]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<SortDir>(null);
  const [page, setPage]         = useState(1);
  const [view, setView]         = useState<'table'|'cards'>('table');

  // Load JSON file list
  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res  = await fetch('/api/list-json');
      const data = await res.json();
      setJsonFiles(data.files ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Load a JSON file's data
  const loadJson = useCallback(async (file: JsonFileMeta) => {
    setSelected(file);
    setLoadingData(true);
    setDataError('');
    setAllData([]);
    setColumns([]);
    setMeta(null);
    setSearch('');
    setCategory('');
    setActiveSheet('All');
    setPage(1);
    setDropOpen(false);

    try {
      const res  = await fetch(file.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setMeta(json.meta);
      setAllData(json.data ?? []);
      setColumns(json.meta.columns ?? []);
    } catch (e: unknown) {
      setDataError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Auto-load first file
  useEffect(() => {
    if (jsonFiles.length > 0 && !selected) loadJson(jsonFiles[0]);
  }, [jsonFiles, selected, loadJson]);

  const detected = detectCols(columns);

  // Category options
  const catOptions = Array.from(new Set(
    allData.map((r) => String(r[detected.category ?? ''] ?? '')).filter(Boolean)
  )).sort();

  const sheets = meta?.sheets ?? [];
  const sheetTabs = ['All', ...sheets];

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, category, activeSheet]);

  // Filtered + sorted
  const processed = (() => {
    let rows = allData;
    if (activeSheet !== 'All') rows = rows.filter((r) => r._sheet === activeSheet);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => columns.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
    }
    if (category && detected.category) {
      rows = rows.filter((r) => String(r[detected.category!] ?? '') === category);
    }
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        if (av === null && bv === null) return 0;
        if (av === null) return 1; if (bv === null) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  })();

  // Stats
  const totalStock = detected.stock ? processed.reduce((a, r) => a + (Number(r[detected.stock!]) || 0), 0) : null;
  const totalValue = detected.price && detected.stock
    ? processed.reduce((a, r) => a + (Number(r[detected.price!]) || 0) * (Number(r[detected.stock!]) || 0), 0) : null;
  const outOfStock = detected.stock ? processed.filter((r) => Number(r[detected.stock!]) <= 0).length : null;

  // Pagination
  const pageSize  = DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const paged      = processed.slice((page - 1) * pageSize, page * pageSize);

  // Sort toggle
  const toggleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); return; }
    if (sortDir === 'asc')  { setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortCol(null); setSortDir(null); }
  };
  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp size={12} style={{ color: THEME_COLOR }} /> : <ChevronDown size={12} style={{ color: THEME_COLOR }} />;
  };

  // Export
  const exportCSV = () => {
    const csv  = toCSV(processed, columns.filter((c) => c !== '_sheet'));
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `export-${Date.now()}.csv`; a.click();
  };

  // Cell renderer
  const renderCell = (row: Row, col: string) => {
    const val = row[col];
    if (val === null) return <span className="text-slate-300">—</span>;
    if (col === detected.stock)    return stockBadge(Number(val));
    if (col === detected.price && typeof val === 'number') return <span className="font-mono text-xs" style={{ color: THEME_COLOR }}>{formatINR(val)}</span>;
    if (col === detected.category) return <span className="badge badge-slate">{String(val)}</span>;
    if (typeof val === 'number')   return <span className="font-mono text-xs text-slate-500">{val.toLocaleString(CURRENCY_LOCALE)}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-1 z-40">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${THEME_COLOR}18` }}>
              <FileSpreadsheet size={16} style={{ color: THEME_COLOR }} />
            </div>
            <span className="font-display font-bold text-slate-900 shrink-0">{APP_TITLE}</span>
            <span className="text-slate-300 hidden sm:block">·</span>
            <span className="text-sm text-slate-500 hidden sm:block truncate">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={fetchList} className="btn-secondary py-1.5 text-xs">
              <RefreshCw size={12} /> Refresh
            </button>
            <Link href="/upload" className="btn-secondary py-1.5 text-xs">
              <Upload size={12} /> Upload
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* File selector */}
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <FileJson size={16} style={{ color: THEME_COLOR }} />
            <span className="font-display text-sm font-semibold text-slate-700">Active Dataset</span>
          </div>

          {loadingList ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading files…
            </div>
          ) : jsonFiles.length === 0 ? (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm text-slate-400">No JSON files found.</span>
              <Link href="/upload" className="btn-primary py-1.5 text-xs">
                <Upload size={12} /> Upload & Convert
              </Link>
            </div>
          ) : (
            <div className="relative flex-1 max-w-sm">
              <button
                onClick={() => setDropOpen((o) => !o)}
                className="input text-left flex items-center justify-between gap-2 pr-3"
              >
                <span className="truncate font-medium text-slate-800 capitalize">
                  {selected?.displayName ?? 'Select a dataset…'}
                </span>
                <ChevDown size={14} className={`text-slate-400 shrink-0 transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 card shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                  {jsonFiles.map((f) => (
                    <button
                      key={f.url}
                      onClick={() => loadJson(f)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${selected?.url === f.url ? 'bg-teal-50' : ''}`}
                    >
                      <FileJson size={14} style={{ color: selected?.url === f.url ? THEME_COLOR : '#94a3b8' }} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate capitalize ${selected?.url === f.url ? 'text-teal-700' : 'text-slate-700'}`}>{f.displayName}</p>
                        <p className="text-xs text-slate-400">{fmt(f.size)} · {new Date(f.uploadedAt).toLocaleDateString('en-IN')}</p>
                      </div>
                      {selected?.url === f.url && <span className="badge badge-teal text-[10px] ml-auto shrink-0">Active</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {meta && (
            <p className="text-xs text-slate-400 shrink-0 hidden lg:block">
              {meta.totalRows.toLocaleString()} rows · {meta.sheets.length} sheet{meta.sheets.length !== 1 ? 's' : ''} · {meta.columns.length} cols
              · Parsed {new Date(meta.convertedAt).toLocaleDateString('en-IN')}
            </p>
          )}
        </div>

        {/* Loading state */}
        {loadingData && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin" style={{ color: THEME_COLOR }} />
            <p className="text-sm">Loading dataset…</p>
          </div>
        )}

        {/* Error state */}
        {!loadingData && dataError && (
          <div className="card p-8 flex flex-col items-center gap-3 text-center max-w-sm mx-auto">
            <AlertTriangle size={28} className="text-amber-500" />
            <p className="font-semibold text-slate-800">Could not load data</p>
            <p className="text-sm text-slate-500">{dataError}</p>
            <button onClick={() => selected && loadJson(selected)} className="btn-secondary">
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loadingData && !dataError && allData.length === 0 && selected && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Package size={32} className="text-slate-200" />
            <p className="font-display font-semibold text-slate-500">No data in this file</p>
          </div>
        )}

        {/* Dashboard content */}
        {!loadingData && !dataError && allData.length > 0 && (
          <div className="space-y-5 fade-in">

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={Hash} label="Total Items" value={processed.length.toLocaleString()} sub={`of ${allData.length.toLocaleString()} total`} color={THEME_COLOR} />
              {totalStock   !== null && <StatCard icon={Layers}        label="Total Stock"    value={totalStock.toLocaleString(CURRENCY_LOCALE)} sub="units"             color="#0ea5e9" />}
              {totalValue   !== null && <StatCard icon={TrendingUp}    label="Portfolio Value" value={formatINR(totalValue)}                      sub="stock × price"     color="#8b5cf6" />}
              {outOfStock   !== null && <StatCard icon={AlertTriangle} label="Out of Stock"   value={String(outOfStock)}                         sub="need restocking"   color="#f59e0b" />}
            </div>

            {/* Sheet tabs */}
            {sheets.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {sheetTabs.map((s) => (
                  <button key={s} onClick={() => setActiveSheet(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeSheet === s ? 'text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300'}`}
                    style={activeSheet === s ? { background: THEME_COLOR } : undefined}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search anything…" className="input pl-9" />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              {catOptions.length > 0 && (
                <div className="relative">
                  <SlidersHorizontal size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input pl-9 min-w-[150px] appearance-none">
                    <option value="">All Categories</option>
                    {catOptions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white shrink-0">
                {(['table','cards'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-3 py-2 transition-all ${view === v ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    style={view === v ? { background: THEME_COLOR } : undefined}>
                    {v === 'table' ? <Table2 size={15} /> : <LayoutGrid size={15} />}
                  </button>
                ))}
              </div>
              <button onClick={exportCSV} className="btn-secondary shrink-0">
                <Download size={13} /> Export CSV
              </button>
            </div>

            {/* Row count */}
            <p className="text-sm text-slate-500">
              <strong className="text-slate-800">{processed.length.toLocaleString()}</strong> rows
              {search && <> matching "<em>{search}</em>"</>}
              {category && <> in <strong>{category}</strong></>}
            </p>

            {/* ── DESKTOP TABLE ── */}
            {view === 'table' && (
              <div className="desktop-table card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        {columns.filter((c) => c !== '_sheet').map((col) => (
                          <th key={col} onClick={() => toggleSort(col)}>
                            <span className="inline-flex items-center gap-1.5">
                              {col.replace(/_/g, ' ')} <SortIcon col={col} />
                            </span>
                          </th>
                        ))}
                        {sheets.length > 1 && <th>Sheet</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.length === 0 ? (
                        <tr><td colSpan={columns.length + 1} className="text-center py-10 text-slate-400 text-sm">No results.</td></tr>
                      ) : paged.map((row, i) => (
                        <tr key={i}>
                          {columns.filter((c) => c !== '_sheet').map((col) => (
                            <td key={col}>{renderCell(row, col)}</td>
                          ))}
                          {sheets.length > 1 && <td><span className="badge badge-slate text-[10px]">{String(row._sheet)}</span></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CARD VIEW (desktop) ── */}
            {view === 'cards' && (
              <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-4">
                {paged.map((row, i) => (
                  <div key={i} className="card p-5 space-y-3 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 truncate">
                        {detected.name ? String(row[detected.name] ?? `Row ${i+1}`) : `Row ${i+1}`}
                      </p>
                      {detected.stock && stockBadge(Number(row[detected.stock]))}
                    </div>
                    {detected.price && row[detected.price] !== null && (
                      <p className="font-mono text-lg font-bold" style={{ color: THEME_COLOR }}>{formatINR(Number(row[detected.price]))}</p>
                    )}
                    {detected.category && <span className="badge badge-slate">{String(row[detected.category] ?? '')}</span>}
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                      {columns.filter((c) => c !== '_sheet' && c !== detected.name && c !== detected.stock && c !== detected.price && c !== detected.category).slice(0, 4).map((col) => (
                        <div key={col} className="text-xs">
                          <span className="text-slate-400 capitalize block">{col.replace(/_/g, ' ')}</span>
                          <span className="text-slate-700 font-medium">{String(row[col] ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── MOBILE CARDS (always shown on small screens) ── */}
            <div className="mobile-cards space-y-3">
              {paged.map((row, i) => (
                <div key={i} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {detected.name ? String(row[detected.name] ?? '—') : `Row ${i+1}`}
                      </p>
                      {detected.category && <span className="badge badge-slate text-[10px] mt-1">{String(row[detected.category] ?? '')}</span>}
                    </div>
                    {detected.stock && stockBadge(Number(row[detected.stock]))}
                  </div>
                  {detected.price && row[detected.price] !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Price</span>
                      <span className="font-mono font-semibold" style={{ color: THEME_COLOR }}>{formatINR(Number(row[detected.price]))}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5">
                    {columns.filter((c) => c !== '_sheet' && c !== detected.name && c !== detected.stock && c !== detected.price && c !== detected.category).slice(0, 6).map((col) => (
                      <div key={col} className="text-xs">
                        <span className="text-slate-400 capitalize">{col.replace(/_/g,' ')}: </span>
                        <span className="text-slate-700">{String(row[col] ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page===1} className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">← Prev</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const s = Math.max(1, Math.min(page-2, totalPages-4));
                    const pg = s + i;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium ${pg===page ? 'text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        style={pg===page ? { background: THEME_COLOR } : undefined}>
                        {pg}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p+1))} disabled={page===totalPages} className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
