import { loadEnv } from 'vite';

const fromFiles = loadEnv('production', process.cwd(), 'VITE_');
const config = {
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || fromFiles.VITE_API_BASE_URL,
  VITE_SOCKET_URL: process.env.VITE_SOCKET_URL || fromFiles.VITE_SOCKET_URL,
};
const failures = [];
for (const name of Object.keys(config)) {
  const value = config[name]?.trim();
  if (!value) {
    failures.push(`${name} is required for a production build.`);
    continue;
  }
  let url;
  try { url = new URL(value); } catch { failures.push(`${name} must be an absolute HTTPS URL.`); continue; }
  if (name === 'VITE_API_BASE_URL' && url.protocol !== 'https:') failures.push(`${name} must use HTTPS.`);
  if (name === 'VITE_SOCKET_URL' && !['https:', 'wss:'].includes(url.protocol)) failures.push(`${name} must use HTTPS or WSS.`);
  if (url.username || url.password) failures.push(`${name} must not include credentials.`);
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) failures.push(`${name} must not point to a loopback host in a production build.`);
}
if (failures.length) {
  console.error(`Production configuration invalid:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Production API and Socket.IO URLs are valid.');
}
