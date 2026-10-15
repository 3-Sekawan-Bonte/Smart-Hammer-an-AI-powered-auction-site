import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAuctionPaymentWinner, openSnapCheckout } from '../src/features/auctions/paymentFlow.js';

test('only the persisted winning user is eligible for the payment interface', () => {
  const ended = { status: 'ended', winner: { id: 7, username: 'winner' } };
  assert.equal(isAuctionPaymentWinner({ id: 7 }, ended), true);
  assert.equal(isAuctionPaymentWinner({ id: 8 }, ended), false);
  assert.equal(isAuctionPaymentWinner({ id: 1 }, { ...ended, status: 'live' }), false);
  assert.equal(isAuctionPaymentWinner({ id: 7 }, { status: 'ended', winner: null }), false);
});

test('Snap receives only the backend token and the two supported payment methods', () => {
  let call;
  const snap = { pay(token, options) { call = { token, options }; } };
  const refreshStatus = () => {};
  const setNotice = () => {};
  assert.equal(openSnapCheckout({ snap, token: 'backend-snap-token', refreshStatus, setNotice }), true);
  assert.equal(call.token, 'backend-snap-token');
  assert.deepEqual(call.options.enabledPayments, ['bca_va', 'echannel']);
  assert.equal(openSnapCheckout({ snap, token: '', refreshStatus, setNotice }), false);
});

test('Snap callbacks request backend status refresh and never set a paid state themselves', () => {
  let options;
  let refreshes = 0;
  const notices = [];
  const snap = { pay(_token, value) { options = value; } };
  openSnapCheckout({ snap, token: 'token-from-backend', refreshStatus: () => { refreshes += 1; }, setNotice: (value) => notices.push(value) });
  for (const callback of ['onSuccess', 'onPending', 'onError', 'onClose']) options[callback]();
  assert.equal(refreshes, 4);
  assert.equal(notices.length, 4);
  assert.equal(Object.hasOwn(options, 'onSuccess') && String(options.onSuccess).includes('status ='), false);
});

test('frontend loads only the Midtrans Sandbox Snap.js URL', async () => {
  const source = await readFile(new URL('../src/components/AuctionPayment.jsx', import.meta.url), 'utf8');
  assert.match(source, /https:\/\/app\.sandbox\.midtrans\.com\/snap\/snap\.js/);
  assert.doesNotMatch(source, /app\.midtrans\.com\/snap\/snap\.js/);
});
