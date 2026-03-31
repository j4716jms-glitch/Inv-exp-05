'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Upload, FileSpreadsheet, Trash2, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Download, ArrowRight, Braces,
  LayoutDashboard, FileJson, Info,
} from 'lucide-react';
import { THEME_COLOR, APP_TITLE } from '@/config/settings.config';

interface BlobFile { url: string; downloadUrl: string; pathname: string; size: number; uploadedAt: string; }
interface JsonFile  { url: string; downloadUrl: string; pathname: string; size: number; uploadedAt: string; displayName: string; }

interface ConvertJob {
  fileUrl: string;
  fileName: string;
  status: 'idle' | 'converting' | 'done' | 'error';
  message: string;
  jsonUrl?: string;
  totalRows?: number;
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function baseName(pathname: string) {
  return pathname.split('/').pop()?.replace(/-[a-z0-9]{8,}(\.[^.]+)$/, '$1') ?? pathname;
}

export default function UploadPage() {
  const [excelFiles, setExcelFiles]     = useState<BlobFile[]>([]);
  const [jsonFiles, setJsonFiles]       = useState<JsonFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [dragging, setDragging]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState<{ type: 'ok'|'err'; text: string }|null>(null);
  const [jobs, setJobs]                 = useState<Record<string, ConvertJob>>({});
  const [deletingUrl, setDeletingUrl]   = useState<string|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [eRes, jRes] = await Promise.all([fetch('/api/list-files'), fetch('/api/list-json')]);
      const [eData, jData] = await Promise.all([eRes.json(), jRes.json()]);
      setExcelFiles(eData.files ?? []);
      setJsonFiles(jData.files ?? []);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setExcelFiles((prev) => [data, ...prev]);
      setUploadMsg({ type: 'ok', text: `"${baseName(data.pathname)}" uploaded! Click Convert ↓` });
    } catch (e: unknown) {
      setUploadMsg({ type: 'err', text: e instanceof Error ? e.message : 'Upload error' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const convertToJson = useCallback(async (file: BlobFile) => {
    const name = baseName(file.pathname);
    setJobs((prev) => ({ ...prev, [file.url]: { fileUrl: file.url, fileName: name, status: 'converting', message: 'Parsing Excel & saving JSON…' } }));
    try {
      const res  = await fetch('/api/parse-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: file.url, originalName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Conversion failed');

      setJobs((prev) => ({
        ...prev,
        [file.url]: {
          fileUrl: file.url, fileName: name, status: 'done',
          message: `${data.meta.totalRows.toLocaleString()} rows · ${data.meta.sheets.length} sheet(s)`,
          jsonUrl: data.jsonUrl, totalRows: data.meta.totalRows,
        },
      }));
      const jRes  = await fetch('/api/list-json');
      const jData = await jRes.json();
      setJsonFiles(jData.files ?? []);
    } catch (e: unknown) {
      setJobs((prev) => ({
        ...prev,
        [file.url]: { fileUrl: file.url, fileName: name, status: 'error', message: e instanceof Error ? e.message : 'Failed' },
      }));
    }
  }, []);

  const deleteFile = useCallback(async (url: string) => {
    setDeletingUrl(url);
    await fetch('/api/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    setExcelFiles((prev) => prev.filter((f) => f.url !== url));
    setJobs((prev) => { const n = {...prev}; delete n[url]; return n; });
    setDeletingUrl(null);
  }, []);

  const deleteJson = useCallback(async (url: string) => {
    setDeletingUrl(url);
    await fetch('/api/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    setJsonFiles((prev) => prev.filter((f) => f.url !== url));
    setDeletingUrl(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-1 z-40">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${THEME_COLOR}18` }}>
              <FileSpreadsheet size={16} style={{ color: THEME_COLOR }} />
            </div>
            <span className="font-display font-bold text-slate-900">{APP_TITLE}</span>
            <span className="text-slate-300 hidden sm:block">·</span>
            <span className="text-sm text-slate-500 hidden sm:block">Upload & Convert</span>
          </div>
          <Link href="/dashboard" className="btn-primary py-1.5 text-xs">
            <LayoutDashboard size={13} /> Dashboard <ArrowRight size={12} />
          </Link>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-7">

        {/* Title */}
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Upload & Convert</h1>
          <p className="text-sm text-slate-500 mt-1">Upload Excel files, convert them to JSON, then open the Dashboard for instant search and filtering.</p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { n: '1', label: 'Upload Excel',     desc: 'Drag & drop .xlsx / .csv', icon: Upload },
            { n: '2', label: 'Convert to JSON',  desc: 'All sheets merged & saved', icon: Braces },
            { n: '3', label: 'Open Dashboard',   desc: 'Search, filter & export',   icon: LayoutDashboard },
          ].map(({ n, label, desc, icon: Icon }) => (
            <div key={n} className="card p-4 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: THEME_COLOR }}>
                {n}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-800 leading-tight">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{desc}</p>
              </div>
              <Icon size={15} className="ml-auto text-slate-200 shrink-0 mt-0.5 hidden md:block" />
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── LEFT: Upload + Excel list ── */}
          <div className="space-y-5">
            {/* Drop zone */}
            <div
              className={`drop-zone rounded-2xl p-8 text-center cursor-pointer ${dragging ? 'dragging' : 'hover:border-teal-400 hover:bg-teal-50/40'}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: `${THEME_COLOR}14` }}>
                {uploading
                  ? <Loader2 size={24} className="animate-spin" style={{ color: THEME_COLOR }} />
                  : <Upload size={24} style={{ color: THEME_COLOR }} />}
              </div>
              <p className="font-display font-semibold text-slate-700 mb-1">
                {uploading ? 'Uploading…' : 'Drop your spreadsheet here'}
              </p>
              <p className="text-sm text-slate-400">.xlsx · .xls · .csv · Max 10 MB · Click to browse</p>
              {uploadMsg && (
                <div className={`mt-4 flex items-center justify-center gap-2 text-sm font-medium ${uploadMsg.type === 'ok' ? 'text-teal-700' : 'text-red-600'}`}>
                  {uploadMsg.type === 'ok' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                  {uploadMsg.text}
                </div>
              )}
            </div>

            {/* Excel files */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={15} className="text-emerald-500" />
                  <span className="font-display text-sm font-semibold text-slate-700">Excel Files</span>
                  <span className="badge badge-teal">{excelFiles.length}</span>
                </div>
                <button onClick={fetchAll} disabled={loadingFiles} className="btn-secondary py-1 px-2.5 text-xs">
                  <RefreshCw size={11} className={loadingFiles ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {excelFiles.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <FileSpreadsheet size={26} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No files uploaded yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {excelFiles.map((f) => {
                    const job  = jobs[f.url];
                    const name = baseName(f.pathname);
                    return (
                      <li key={f.url} className="px-4 py-3 space-y-2.5">
                        {/* File info row */}
                        <div className="flex items-center gap-2.5">
                          <FileSpreadsheet size={15} className="text-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                            <p className="text-xs text-slate-400">
                              {fmt(f.size)} · {new Date(f.uploadedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                            </p>
                          </div>
                          <a href={f.downloadUrl} download onClick={(e)=>e.stopPropagation()}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Download">
                            <Download size={13} />
                          </a>
                          <button onClick={() => deleteFile(f.url)} disabled={deletingUrl === f.url}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                            {deletingUrl === f.url ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>

                        {/* Convert status / button */}
                        {!job || job.status === 'idle' ? (
                          <button onClick={() => convertToJson(f)} className="btn-primary w-full justify-center py-2 text-xs">
                            <Braces size={13} /> Convert to JSON
                          </button>
                        ) : job.status === 'converting' ? (
                          <div className="flex items-center gap-2 text-xs text-teal-600 bg-teal-50 rounded-xl px-3 py-2.5">
                            <Loader2 size={13} className="animate-spin shrink-0" /> {job.message}
                          </div>
                        ) : job.status === 'done' ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                            <CheckCircle2 size={13} className="shrink-0" />
                            <span className="flex-1">Saved — {job.message}</span>
                            <button onClick={() => convertToJson(f)} className="text-slate-400 hover:text-slate-600" title="Re-convert">
                              <RefreshCw size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                              <AlertCircle size={13} className="shrink-0 mt-0.5" />
                              <span>{job.message}</span>
                            </div>
                            <button onClick={() => convertToJson(f)} className="btn-secondary w-full justify-center py-1.5 text-xs">
                              <RefreshCw size={11} /> Retry Conversion
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── RIGHT: JSON files ── */}
          <div className="space-y-5">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileJson size={15} style={{ color: THEME_COLOR }} />
                  <span className="font-display text-sm font-semibold text-slate-700">Saved JSON Files</span>
                  <span className="badge badge-teal">{jsonFiles.length}</span>
                </div>
              </div>

              <div className="px-4 py-3 bg-teal-50/60 border-b border-teal-100 flex items-start gap-2">
                <Info size={13} className="text-teal-600 mt-0.5 shrink-0" />
                <p className="text-xs text-teal-700">
                  Pre-parsed JSON loads instantly in the Dashboard — no re-processing on every visit.
                </p>
              </div>

              {jsonFiles.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileJson size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No JSON files yet</p>
                  <p className="text-xs mt-1">Convert an Excel file to get started.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {jsonFiles.map((f) => (
                    <li key={f.url} className="px-4 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${THEME_COLOR}12` }}>
                        <FileJson size={16} style={{ color: THEME_COLOR }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate capitalize">{f.displayName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fmt(f.size)} · {new Date(f.uploadedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      </div>
                      <a href={f.downloadUrl} download
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Download JSON">
                        <Download size={13} />
                      </a>
                      <button onClick={() => deleteJson(f.url)} disabled={deletingUrl === f.url}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                        {deletingUrl === f.url ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {jsonFiles.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                  <Link href="/dashboard" className="btn-primary w-full justify-center py-2.5">
                    <LayoutDashboard size={15} /> Open Dashboard <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
