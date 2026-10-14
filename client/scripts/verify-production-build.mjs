import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = join(root, 'index.html');
const index = await readFile(indexPath, 'utf8');
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
const missing = [];
for (const reference of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const asset = reference[1];
  if (asset.startsWith('http') || asset.startsWith('data:') || asset.startsWith('#')) continue;
  const target = join(root, asset.replace(/^\//, ''));
  try { await stat(target); } catch { missing.push(asset); }
}
const jsFiles = files.filter((path) => path.endsWith('.js'));
const bundle = (await Promise.all(jsFiles.map((path) => readFile(path, 'utf8')))).join('\n');
const configured = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
for (const name of ['VITE_API_BASE_URL', 'VITE_SOCKET_URL']) {
  if (configured[name] && !bundle.includes(configured[name])) missing.push(`${name} was not embedded in the production bundle`);
}
const unsafePatterns = [
  ['mock fault-injection route', /\/__mock\//],
  ['mock JWT secret variable', /BIDWAR_MOCK_JWT_SECRET/],
  ['AI provider key variable', /AI_API_KEY/],
  ['private password hash field', /passwordHash/],
  ['OpenAI-style secret', /sk-[A-Za-z0-9_-]{24,}/],
];
const exposed = unsafePatterns.filter(([, pattern]) => pattern.test(bundle)).map(([label]) => label);
if (missing.length || exposed.length) {
  if (missing.length) console.error(`Missing build assets: ${missing.join(', ')}`);
  if (exposed.length) console.error(`Unsafe production bundle content: ${exposed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Production bundle verified: ${files.length} files, all index assets resolve, no flagged mock controls or secrets.`);
}
