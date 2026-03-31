export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

function normalizeKey(raw: string): string {
  return String(raw).trim().replace(/\s+/g, '_').toLowerCase();
}

function coerceValue(val: unknown): string | number | boolean | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  const s = String(val).trim();
  if (s === '') return null;
  const num = Number(s);
  if (!isNaN(num)) return num;
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { url, originalName } = body ?? {};

    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return NextResponse.json({ error: `Blob fetch failed: ${fileRes.status}` }, { status: 502 });
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const uint8Array  = new Uint8Array(arrayBuffer);

    const XLSX = require('xlsx');
    const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd', cellNF: false, cellText: false });

    if (!workbook.SheetNames?.length) {
      return NextResponse.json({ error: 'No sheets found in file.' }, { status: 422 });
    }

    const allRows: Record<string, unknown>[] = [];
    const sheetNames: string[] = workbook.SheetNames;
    const allColumnsSet = new Set<string>();

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, blankrows: false, raw: false });
      for (const rawRow of rawRows) {
        const row: Record<string, unknown> = { _sheet: sheetName };
        for (const [key, val] of Object.entries(rawRow)) {
          const nk = normalizeKey(key);
          if (!nk) continue;
          row[nk] = coerceValue(val);
          allColumnsSet.add(nk);
        }
        allRows.push(row);
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'File has no data rows.' }, { status: 422 });
    }

    const columns = Array.from(allColumnsSet);
    const convertedAt = new Date().toISOString();

    const jsonPayload = {
      meta: { originalName: originalName ?? 'unknown', sourceUrl: url, sheets: sheetNames, totalRows: allRows.length, columns, convertedAt },
      data: allRows,
    };

    const baseName = (originalName ?? 'inventory').replace(/\.(xlsx|xls|csv)$/i, '').replace(/[^a-z0-9_\-]/gi, '_');
    const jsonBlob = await put(`json/${baseName}.json`, JSON.stringify(jsonPayload), { access: 'public', addRandomSuffix: true, contentType: 'application/json' });

    return NextResponse.json({ success: true, jsonUrl: jsonBlob.url, jsonPathname: jsonBlob.pathname, meta: jsonPayload.meta });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/parse-and-save]', msg);
    return NextResponse.json({ error: `Failed: ${msg}` }, { status: 500 });
  }
}
