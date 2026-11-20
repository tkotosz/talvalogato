import { createServer } from 'node:http';
import worker from '../dist/server/index.js';

const port = Number(process.env.MEAL_DECK_PORT ?? 4173);
createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
  try {
    const response = await worker.fetch(new Request(url, { method: incoming.method, headers: incoming.headers }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500).end('Server error');
    console.error(error);
  }
}).listen(port, '127.0.0.1', () => console.log(`Local preview http://127.0.0.1:${port}`));
