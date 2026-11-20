import assets from 'meal-deck-assets';
import { menuCatalog, nutritionFor, publishedWeeks } from './teletal.js';
import { mondayOfWeek } from './weeks.js';

const menuRequests = new Map();
const seconds = { weeks: 300, menu: 600, nutrition: 21_600 };
const detailsPattern = /^[1-5]:[1-9]:[A-Z0-9][A-Z0-9-]{0,15}$/;
const decodingBytes = encoded => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));

async function cachedJson(request, ctx, maxAge, getValue) {
  const cache = globalThis.caches?.default;
  const existing = await cache?.match(request);
  if (existing) return existing;
  const payload = await getValue();
  const response = Response.json(payload, {
    headers: { 'Cache-Control': `private, max-age=${maxAge}` },
  });
  if (cache && !payload.some(entry => entry.retryable)) {
    const stored = new Response(response.clone().body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` },
    });
    ctx?.waitUntil(cache.put(request, stored).catch(error => console.info('Cache write skipped', error.message)));
  }
  return response;
}

function getCatalog(week) {
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

async function serveApi(request, url, ctx) {
  try {
    if (url.pathname === '/api/weeks') return await cachedJson(request, ctx, seconds.weeks, publishedWeeks);

    const week = url.searchParams.get('week') ?? '';
    if (!mondayOfWeek(week)) return Response.json({ error: 'Choose a published week.' }, { status: 400 });

    if (url.pathname === '/api/menu') {
      return await cachedJson(request, ctx, seconds.menu, () => getCatalog(week));
    }
    if (url.pathname === '/api/nutrition') {
      const ids = [...new Set((url.searchParams.get('items') ?? '').split(','))];
      if (ids.length > 10 || ids.some(id => !detailsPattern.test(id))) {
        return Response.json({ error: 'This nutrition request is invalid.' }, { status: 400 });
      }
      return await cachedJson(request, ctx, seconds.nutrition, () => nutritionFor(week, ids));
    }
    return new Response('Not found', { status: 404 });
  } catch (error) {
    console.warn(`Teletál data unavailable for ${url.pathname}`, error.message);
    return Response.json({ error: 'Teletál’s menu is temporarily unavailable. Try again in a moment.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (url.pathname.startsWith('/api/')) return serveApi(request, url, ctx);
    const asset = Object.hasOwn(assets, url.pathname) && assets[url.pathname];
    if (!asset) return new Response('Not found', { status: 404 });
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
