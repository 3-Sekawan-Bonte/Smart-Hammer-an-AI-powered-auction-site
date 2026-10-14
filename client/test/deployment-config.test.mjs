import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const directory = dirname(fileURLToPath(import.meta.url));
const checker = join(directory, '../scripts/check-production-config.mjs');
const check = (api, socket) => spawnSync(process.execPath, [checker], {
  cwd: join(directory, '..'),
  encoding: 'utf8',
  env: { ...process.env, VITE_API_BASE_URL: api, VITE_SOCKET_URL: socket },
});

test('production config accepts separate HTTPS API and Socket.IO hosts', () => {
  const result = check('https://api.example.com/v1', 'wss://realtime.example.com');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('production config rejects missing, insecure, loopback, and credential-bearing endpoints', () => {
  for (const [api, socket] of [
    ['', 'https://api.example.com'],
    ['http://api.example.com', 'https://api.example.com'],
    ['https://localhost:3001', 'https://api.example.com'],
    ['https://user:secret@api.example.com', 'https://api.example.com'],
    ['https://api.example.com', 'http://api.example.com'],
  ]) assert.notEqual(check(api, socket).status, 0);
});
