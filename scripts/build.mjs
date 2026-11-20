import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pages = process.argv[2] === '--pages';
const output = new URL(pages ? '../pages-dist/' : '../dist/', import.meta.url);
const workerFile = pages ? 'pages-dist/_worker.js' : 'dist/server/index.js';
const assets = {};
const contentTypes = {
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  png: 'image/png',
};

function addAsset(path, data) {
  const ext = path === '/' ? 'html' : path.split('.').at(-1);
  assets[path] = [contentTypes[ext], Buffer.from(data).toString('base64')];
}

const client = await build({
  entryPoints: ['src/app.jsx'],
  bundle: true, write: false, outdir: 'client', entryNames: '[name]-[hash]',
  minify: true, charset: 'utf8', jsx: 'automatic', target: ['safari16.4', 'chrome110'],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});

const script = client.outputFiles.find(file => file.path.endsWith('.js'));
const style = client.outputFiles.find(file => file.path.endsWith('.css'));
const scriptPath = `/assets/${script.path.split('/').at(-1)}`;
const stylePath = `/assets/${style.path.split('/').at(-1)}`;
addAsset(scriptPath, script.contents);
addAsset(stylePath, style.contents);

for (const name of await readdir('public')) {
  if (name === 'index.html' || name === 'sw.js') continue;
  addAsset(`/${name}`, await readFile(`public/${name}`));
}

const index = (await readFile('public/index.html', 'utf8')).replace('%SCRIPT%', scriptPath).replace('%STYLE%', stylePath);
addAsset('/', index);
addAsset('/index.html', index);
const version = createHash('sha256').update(index).update(JSON.stringify(assets)).digest('hex').slice(0, 12);
const shell = ['/', scriptPath, stylePath, '/manifest.webmanifest', '/icon-192.png'];
const serviceWorker = (await readFile('public/sw.js', 'utf8'))
  .replace("'VERSION'", JSON.stringify(`meal-deck-${version}`))
  .replace("['SHELL']", JSON.stringify(shell));
addAsset('/sw.js', serviceWorker);

await rm(output, { recursive: true, force: true });
if (pages) {
  await mkdir(new URL('assets/', output), { recursive: true });
  for (const [path, [, content]] of Object.entries(assets)) {
    if (path !== '/') await writeFile(new URL(path.slice(1), output), Buffer.from(content, 'base64'));
  }
  await cp('cloudflare/pages', output, { recursive: true });
} else {
  await mkdir(new URL('.openai/', output), { recursive: true });
  await cp('.openai/hosting.json', new URL('.openai/hosting.json', output));
  await writeFile(new URL('package.json', output), '{"type":"module"}\n');
}
await build({
  entryPoints: ['src/worker.js'],
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  outfile: workerFile, minify: true, charset: 'utf8',
  plugins: [{
    name: 'embedded-assets',
    setup(context) {
      context.onResolve({ filter: /^meal-deck-assets$/ }, () => ({ path: 'assets', namespace: 'embedded' }));
      context.onLoad({ filter: /.*/, namespace: 'embedded' }, () => ({
        contents: `export default ${JSON.stringify(pages ? {} : assets)}`,
        loader: 'js',
      }));
    },
  }],
});
const bytes = (await readFile(workerFile)).length;
console.log(`Built Tálválogató in ${pages ? 'pages-dist' : 'dist'} (Worker ${Math.round(bytes / 1024)} KiB)`);
