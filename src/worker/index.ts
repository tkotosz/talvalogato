import assets from 'talvalogato-assets';
import { serveApi, type Env } from './api.ts';

const decodingBytes = (encoded: string) => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Ez a művelet nem engedélyezett.', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (url.pathname.startsWith('/api/')) return serveApi(url, env);
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
