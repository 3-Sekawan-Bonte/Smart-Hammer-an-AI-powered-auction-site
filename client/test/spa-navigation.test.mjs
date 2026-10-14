import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the app mounts one stable BrowserRouter, Redux store, and persistent providers at bootstrap', async () => {
  const main = await source('../src/main.jsx');
  const app = await source('../src/App.jsx');
  const store = await source('../src/app/store.js');

  assert.equal((main.match(/<BrowserRouter>/g) || []).length, 1);
  assert.match(main, /<Provider store=\{store\}>[\s\S]*<BrowserRouter>[\s\S]*<AuthProvider>[\s\S]*<SocketProvider>[\s\S]*<App\s*\/>/);
  assert.match(main, /import \{ store \} from '\.\/app\/store'/);
  assert.doesNotMatch(app, /BrowserRouter|RouterProvider|createBrowserRouter/);
  assert.match(app, /<Route element=\{<Layout\s*\/>\}>[\s\S]*<Route path="\*"/);
  assert.match(store, /export const store = configureStore\(/);
});

test('all application routes render under the shared layout and protected redirects use Router navigation', async () => {
  const app = await source('../src/App.jsx');
  const layout = await source('../src/components/Layout.jsx');
  const protectedRoute = await source('../src/components/ProtectedRoute.jsx');
  const guestRoute = await source('../src/components/GuestRoute.jsx');

  for (const route of ['index', 'login', 'register', 'auctions/new', 'auctions/:id/edit', 'auctions/:id', 'my-auctions', '*']) {
    assert.ok(app.includes(`path="${route}"`) || route === 'index' && app.includes('<Route index'), `missing route ${route}`);
  }
  assert.match(layout, /<Outlet\s*\/>/);
  assert.match(layout, /<NavLink[^>]+to="\/"/);
  assert.match(layout, /<NavLink[^>]+to="\/my-auctions"/);
  assert.match(protectedRoute, /<Navigate to="\/login" replace state=\{\{ from: location \}\}/);
  assert.match(guestRoute, /<Navigate to=\{location\.state\?\.from \|\| '\/'\} replace \/>/);
});

test('internal navigation never falls back to browser location APIs or ordinary internal anchors', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('rg', [
    '-n',
    'window\\.location|location\\.(href|assign|replace|reload)|document\\.location|<a[^>]+href=["\\x27]/|<form[^>]+action=["\\x27]/',
    'src',
    'index.html',
    '--glob', '!**/graphify-out/**',
  ], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });

  assert.ok([0, 1].includes(result.status), result.stderr || `rg exited ${result.status}`);
  assert.equal(result.stdout, '', `hard navigation or raw internal anchor found:\n${result.stdout}`);
});

test('auth, auction, and bid forms handle submits in React', async () => {
  const auth = await source('../src/pages/AuthPage.jsx');
  const auction = await source('../src/components/AuctionForm.jsx');
  const bid = await source('../src/components/BidForm.jsx');
  const create = await source('../src/pages/CreateAuctionPage.jsx');

  assert.match(auth, /const submit = async \(event\) => \{\s*event\.preventDefault\(\)/);
  assert.match(auction, /async function handleSubmit\(event\) \{\s*event\.preventDefault\(\)/);
  assert.match(bid, /onSubmit=\{\(e\)\s*=>\s*handleSubmit\(e\)\}/);
  assert.match(create, /navigate\(`\/auctions\/\$\{created\.id\}`/);
  assert.match(create, /navigate\(`\/auctions\/\$\{id\}`/);
});

test('socket client is a module singleton and route changes only update room membership', async () => {
  const socket = await source('../src/lib/socket.js');
  const context = await source('../src/contexts/SocketContext.jsx');

  assert.match(socket, /let socket\s*=\s*null/);
  assert.match(socket, /export function initSocket\(/);
  assert.match(context, /useLocation\(\)/);
  assert.match(context, /joinAuctionRoom\(routeAuctionId\)/);
  assert.match(context, /leaveAuctionRoom\(routeAuctionId\)/);
  assert.doesNotMatch(context, /window\.location|location\.reload/);
});
