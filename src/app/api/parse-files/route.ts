export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

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
  // Always return JSON — wrap everything
  try {
    // 1. Parse body
    const body = await req.json().catch(() => null);
    const url: string = body?.url;
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // 2. Fetch the file from Vercel Blob (server-side, no CORS issue)
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Blob fetch failed with status ${fileRes.status}. Check BLOB_READ_WRITE_TOKEN.` },
        { status: 502 }
      );
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const uint8Array  = new Uint8Array(arrayBuffer);

    // 3. Load xlsx natively — serverExternalPackages in next.config.js ensures
    //    Next.js never tries to webpack-bundle this module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');

    // 4. Read workbook from raw bytes
    const workbook = XLSX.read(uint8Array, {
      type: 'array',       // pass raw Uint8Array
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      cellNF: false,
      cellText: false,
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'No sheets found in this file.' }, { status: 422 });
    }

    // 5. Merge all sheets into one JSON array
    const allRows: Record<string, unknown>[] = [];
    const sheetNames: string[] = workbook.SheetNames;
    const allColumnsSet = new Set<string>();

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        blankrows: false,
        raw: false,         // get formatted strings for dates etc.
      });

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
      return NextResponse.json(
        { error: 'File parsed successfully but contains no data rows. Check that your sheet has a header row.' },
        { status: 422 }
      );
    }

    const columns = Array.from(allColumnsSet);

    return NextResponse.json({
      data: allRows,
      sheets: sheetNames,
      totalRows: allRows.length,
      columns,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/parse-file]', msg);
    return NextResponse.json({ error: `Parse failed: ${msg}` }, { status: 500 });
  }
}
