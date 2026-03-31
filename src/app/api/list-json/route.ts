export const runtime = 'nodejs';
import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'json/' });
    const files = blobs
      .filter((b) => b.pathname.endsWith('.json'))
      .map((b) => ({
        url: b.url,
        downloadUrl: b.downloadUrl,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
        displayName: b.pathname.replace('json/', '').replace(/-[a-z0-9]{8,}\.json$/, '').replace(/_/g, ' '),
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return NextResponse.json({ files });
  } catch (err) {
    console.error('[/api/list-json]', err);
    return NextResponse.json({ error: 'Could not list JSON files' }, { status: 500 });
  }
}
