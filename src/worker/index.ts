import assets from 'talvalogato-assets';
import type { CatalogDish, WeekKey } from '../core/types.ts';
import { mondayOfWeek } from '../core/weeks.ts';
import { menuCatalog, nutritionFor, publishedWeeks } from './teletal.ts';

// The parts of the Cloudflare Workers runtime this Worker uses.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
const edgeCache = (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;

const menuRequests = new Map<WeekKey, { promise: Promise<CatalogDish[]>; expires: number }>();
const seconds = { weeks: 300, menu: 3_600, nutrition: 21_600 };
const detailsPattern = /^[1-7]:[1-9]:[A-Z0-9][A-Z0-9-]{0,15}$/;
const decodingBytes = (encoded: string) => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));

async function cachedJson(
  request: Request,
  ctx: ExecutionContext | undefined,
  maxAge: number,
  getValue: () => Promise<object[]>,
): Promise<Response> {
  const existing = await edgeCache?.match(request);
  if (existing) return existing;
  const payload = await getValue();
  const response = Response.json(payload, {
    headers: { 'Cache-Control': `private, max-age=${maxAge}` },
  });
  if (edgeCache && !payload.some(entry => 'retryable' in entry && entry.retryable)) {
    const stored = new Response(response.clone().body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` },
    });
    ctx?.waitUntil(edgeCache.put(request, stored).catch((error: Error) => console.info('Cache write skipped', error.message)));
  }
  return response;
}

function getCatalog(week: WeekKey): Promise<CatalogDish[]> {
  const existing = menuRequests.get(week);
  if (existing && existing.expires > Date.now()) return existing.promise;
  for (const [key, entry] of menuRequests) {
    if (entry.expires <= Date.now()) menuRequests.delete(key);
  }
  const promise = menuCatalog(week).catch(error => {
    menuRequests.delete(week);
    throw error;
  });
  menuRequests.set(week, { promise, expires: Date.now() + seconds.menu * 1000 });
  return promise;
}

async function serveApi(request: Request, url: URL, ctx?: ExecutionContext): Promise<Response> {
  try {
    if (url.pathname === '/api/weeks') return await cachedJson(request, ctx, seconds.weeks, publishedWeeks);

    const week = url.searchParams.get('week') ?? '';
    if (!mondayOfWeek(week)) return Response.json({ error: 'Válassz a közzétett hetek közül.' }, { status: 400 });

    if (url.pathname === '/api/menu') {
      if (url.searchParams.get('recheck') === '1') {
        return Response.json(await menuCatalog(week), { headers: { 'Cache-Control': 'no-store' } });
      }
      return await cachedJson(request, ctx, seconds.menu, () => getCatalog(week));
    }
    if (url.pathname === '/api/nutrition') {
      const ids = [...new Set((url.searchParams.get('items') ?? '').split(','))];
      if (ids.length > 10 || ids.some(id => !detailsPattern.test(id))) {
        return Response.json({ error: 'A tápértékadatok lekérése érvénytelen.' }, { status: 400 });
      }
      return await cachedJson(request, ctx, seconds.nutrition, () => nutritionFor(week, ids));
    }
    return new Response('Az oldal nem található.', { status: 404 });
  } catch (error) {
    console.warn(`Teletál data unavailable for ${url.pathname}`, error instanceof Error ? error.message : error);
    return Response.json(
      { error: 'A Teletál étlapja átmenetileg nem érhető el. Próbáld újra egy kis idő múlva.' },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

export default {
  async fetch(request: Request, env?: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Ez a művelet nem engedélyezett.', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (url.pathname.startsWith('/api/')) return serveApi(request, url, ctx);
    const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : undefined;
    if (!asset) return env?.ASSETS?.fetch(request) ?? new Response('Az oldal nem található.', { status: 404 });
    const [contentType, value] = asset;
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    return new Response(request.method === 'HEAD' ? null : decodingBytes(value), { headers });
  },
};
