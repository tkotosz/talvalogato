import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { buildDevWorker } from './build.mjs';

const port = Number(process.env.TALVALOGATO_PORT ?? 4173);
const clients = new Set();
let current;
let timer;
let building = false;
let rebuildQueued = false;

function scheduleBuild() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 75);
}

function sendRevision(client) {
  if (current) client.write(`data: ${current.revision}\n\n`);
}

async function rebuild() {
  if (building) {
    rebuildQueued = true;
    return;
  }
  building = true;
  do {
    rebuildQueued = false;
    try {
      const worker = await buildDevWorker();
      current = { worker, revision: randomUUID() };
      for (const client of clients) sendRevision(client);
      console.log('Built Tálválogató (live reload)');
    } catch (error) {
      console.error('Build failed. Watching for changes.', error.message);
    }
  } while (rebuildQueued);
  building = false;
}

function withLiveReload(html, revision) {
  const script = `<script>
  (() => {
    const updates = new EventSource('/__dev/reload');
    updates.onmessage = event => {
      if (event.data === ${JSON.stringify(revision)}) return;
      updates.close();
      location.reload();
    };
  })();
</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}\n</body>`) : html + script;
}

const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url, `http://127.0.0.1:${server.address().port}`);
  if (url.pathname === '/__dev/reload' && incoming.method === 'GET') {
    outgoing.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    outgoing.write('retry: 500\n\n');
    clients.add(outgoing);
    outgoing.on('close', () => clients.delete(outgoing));
    sendRevision(outgoing);
    return;
  }

  const build = current;
  if (!build) {
    outgoing.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    outgoing.end(withLiveReload('<!doctype html><title>Tálválogató</title><p>Waiting for a successful build…</p>', null));
    return;
  }

  try {
    const response = await build.worker.fetch(new Request(url, { method: incoming.method, headers: incoming.headers }));
    const headers = Object.fromEntries(response.headers);
    if (incoming.method === 'GET' && headers['content-type']?.startsWith('text/html')) {
      const html = withLiveReload(await response.text(), build.revision);
      delete headers['content-length'];
      outgoing.writeHead(response.status, headers).end(html);
      return;
    }
    const body = Buffer.from(await response.arrayBuffer());
    outgoing.writeHead(response.status, headers).end(body);
  } catch (error) {
    outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Szerverhiba.');
    console.error(error);
  }
});

server.listen(port, '127.0.0.1', () => {
  for (const directory of ['src', 'public']) {
    watch(new URL(`../${directory}/`, import.meta.url), { recursive: true }, scheduleBuild);
  }
  console.log(`Local preview http://127.0.0.1:${server.address().port}`);
  void rebuild();
});
