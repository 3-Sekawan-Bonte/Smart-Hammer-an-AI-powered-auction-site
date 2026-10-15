export const AUCTION_DURATION_OPTIONS = [
  { label: '3 menit', seconds: 180 },
  { label: '1 day', seconds: 86_400 },
  { label: '3 days', seconds: 259_200 },
  { label: '7 days', seconds: 604_800 },
];

export const AUCTION_DURATION_VALUES = AUCTION_DURATION_OPTIONS.map(({ seconds }) => seconds);

export function isSupportedAuctionDuration(value) {
  return AUCTION_DURATION_VALUES.includes(value);
}

export function parseAuctionDuration(value) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && isSupportedAuctionDuration(seconds) ? seconds : null;
}

export function auctionDurationSelection(seconds) {
  return String(seconds ?? AUCTION_DURATION_OPTIONS[0].seconds);
}

export function auctionDurationLabel(seconds) {
  const option = AUCTION_DURATION_OPTIONS.find((item) => item.seconds === seconds);
  if (option) return option.label;
  for (const [unit, divisor] of [['day', 86_400], ['hour', 3_600], ['minute', 60]]) {
    if (Number.isInteger(seconds) && seconds > 0 && seconds % divisor === 0) {
      const count = seconds / divisor;
      return `${count} ${unit}${count === 1 ? '' : 's'}`;
    }
  }
  return `${seconds} seconds`;
}
