export function isAuctionPaymentWinner(user, auction) {
  return auction?.status === 'ended'
    && user?.id != null
    && auction.winner?.id != null
    && String(user.id) === String(auction.winner.id);
}

export function openSnapCheckout({ snap, token, refreshStatus, setNotice }) {
  if (!snap?.pay || typeof token !== 'string' || !token) return false;
  snap.pay(token, {
    enabledPayments: ['bca_va', 'echannel'],
    onSuccess: () => { setNotice('Checkout memberi konfirmasi. Memverifikasi status pembayaran dengan server…'); refreshStatus(); },
    onPending: () => { setNotice('Pembayaran menunggu konfirmasi. Status akan diperbarui dari server.'); refreshStatus(); },
    onError: () => { setNotice('Checkout melaporkan kegagalan. Memeriksa status resmi…'); refreshStatus(); },
    onClose: () => { setNotice('Checkout ditutup. Status pembayaran tetap mengikuti konfirmasi server.'); refreshStatus(); },
  });
  return true;
}
