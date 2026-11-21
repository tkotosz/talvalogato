import { mondayOfWeek } from '../core/weeks.ts';

// The part of the Cloudflare Workers runtime environment this Worker uses.
export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Where the menu data files are published; the data branch on GitHub unless set. */
  MENU_DATA_URL?: string;
}

const defaultMenuDataUrl = 'https://raw.githubusercontent.com/tkotosz/talvalogato/data/menu/';
const cacheSeconds = 300;
const unavailable = () =>
  Response.json(
    { error: 'A Teletál étlapja átmenetileg nem érhető el. Próbáld újra egy kis idő múlva.' },
    { status: 502, headers: { 'Cache-Control': 'no-store' } },
  );

/** Hands out one menu data file. Fetching takes no CPU time, so this stays far below the Worker's limits. */
async function menuData(file: string, env: Env | undefined): Promise<Response> {
  const url = new URL(file, env?.MENU_DATA_URL ?? defaultMenuDataUrl);
  // Cloudflare caches the fetched file at the edge; elsewhere the option is ignored.
  const response = await fetch(url, { cf: { cacheTtl: cacheSeconds, cacheEverything: true } } as RequestInit).catch(() => null);
  if (response?.status === 404) {
    return Response.json(
      { error: 'Válassz a közzétett hetek közül.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!response?.ok) return unavailable();
  return new Response(response.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${cacheSeconds}` },
  });
}

/** Answers the /api routes from the published menu data. */
export function serveApi(url: URL, env: Env | undefined): Promise<Response> | Response {
  if (url.pathname === '/api/weeks') return menuData('weeks.json', env);
  if (url.pathname === '/api/menu') {
    const week = url.searchParams.get('week') ?? '';
    if (!mondayOfWeek(week)) return Response.json({ error: 'Válassz a közzétett hetek közül.' }, { status: 400 });
    return menuData(`${week}.json`, env);
  }
  return new Response('Az oldal nem található.', { status: 404 });
}
