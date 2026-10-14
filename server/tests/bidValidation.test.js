const { validateBidInput, validateAuctionId } = require('../src/utils/bidValidation');

const valid = { amount: 1_500_000, clientRequestId: '550e8400-e29b-41d4-a716-446655440000' };

function expectValidationError(callback) {
  try {
    callback();
    throw new Error('Expected validation to fail.');
  } catch (error) {
    expect(error.code).toBe('VALIDATION_ERROR');
  }
}

describe('bid input validation', () => {
  test('accepts a valid bid and normalizes UUID casing', () => {
    expect(validateBidInput({ ...valid, clientRequestId: valid.clientRequestId.toUpperCase() })).toEqual(valid);
  });

  test('rejects invalid amounts, UUIDs, and unknown or client-controlled fields', () => {
    for (const input of [
      { ...valid, amount: 1.5 },
      { ...valid, amount: 0 },
      { ...valid, amount: -1 },
      { ...valid, amount: 2_000_000_001 },
      { ...valid, clientRequestId: 'bad' },
      { ...valid, sellerId: 1 },
    ]) {
      expectValidationError(() => validateBidInput(input));
    }
  });

  test('requires a JSON object', () => {
    expectValidationError(() => validateBidInput(null));
    expectValidationError(() => validateBidInput([]));
  });

  test('accepts only positive safe integer auction IDs', () => {
    expect(validateAuctionId('37')).toBe(37);
    for (const id of ['0', '-1', '1.2', 'not-an-id', '9007199254740992']) {
      expectValidationError(() => validateAuctionId(id));
    }
  });
});
