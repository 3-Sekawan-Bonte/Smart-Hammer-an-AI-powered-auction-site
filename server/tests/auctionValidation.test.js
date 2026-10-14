const { validateAuctionInput, validateAuctionId, validateEmptyBody } = require('../src/utils/auctionValidation');
const { auctionToJSON } = require('../src/utils/auctionSerializer');

const validInput = {
  title: 'Smartphone Z',
  description: 'A used smartphone with a working screen.',
  condition: 'used_good',
  category: 'smartphone',
  startingPrice: 1,
  minIncrement: 1,
  durationSeconds: 60,
};

function expectValidationError(callback, field) {
  try {
    callback();
    throw new Error('Expected validation to fail.');
  } catch (error) {
    expect(error.code).toBe('VALIDATION_ERROR');
    if (field) expect(Object.hasOwn(error.fields, field)).toBe(true);
  }
}

describe('auction input validation', () => {
  test('normalizes documented defaults and validates a valid create payload', () => {
    expect(validateAuctionInput(validInput)).toMatchObject({
      ...validInput,
      productFacts: { specifications: null, defects: null, accessories: [], warranty: null },
      imageUrl: null,
    });
  });

  test.each([
    [{ ...validInput, condition: 'newish' }, 'condition'],
    [{ ...validInput, category: 'electronics' }, 'category'],
    [{ ...validInput, productFacts: { accessories: null } }, 'productFacts.accessories'],
    [{ ...validInput, imageUrl: '' }, 'imageUrl'],
    [{ ...validInput, currentPrice: 2 }, 'currentPrice'],
    [{ ...validInput, extra: true }, 'extra'],
    [{ ...validInput, startingPrice: 2_000_000_001 }, 'startingPrice'],
    [{ ...validInput, durationSeconds: 604801 }, 'durationSeconds'],
  ])('rejects invalid values with field errors', (payload, field) => {
    expectValidationError(() => validateAuctionInput(payload), field);
  });

  test.each([86400, 259200, 604800])('accepts supported duration boundary %i seconds', (durationSeconds) => {
    expect(validateAuctionInput({ ...validInput, durationSeconds }).durationSeconds).toBe(durationSeconds);
  });

  test('retains the 60-second minimum duration', () => {
    expect(validateAuctionInput({ ...validInput, durationSeconds: 60 }).durationSeconds).toBe(60);
    expectValidationError(() => validateAuctionInput({ ...validInput, durationSeconds: 59 }), 'durationSeconds');
  });

  test('validates partial updates without requiring omitted fields', () => {
    expect(validateAuctionInput({ title: 'A new title' }, { partial: true })).toEqual({ title: 'A new title' });
  });

  test.each([['0'], ['-1'], ['1.5'], ['abc'], ['9007199254740992']])('rejects invalid auction ID %s', (id) => {
    expectValidationError(() => validateAuctionId(id), 'id');
  });

  test('accepts a positive integer auction ID', () => {
    expect(validateAuctionId('42')).toBe(42);
  });

  test('rejects lifecycle fields in the start request body', () => {
    expectValidationError(() => validateEmptyBody({ status: 'ended' }), 'status');
    expect(() => validateEmptyBody({})).not.toThrow();
    expect(() => validateEmptyBody(undefined)).not.toThrow();
  });
});

describe('auction serializer', () => {
  test('returns the public auction fields and strips private association fields', () => {
    const result = auctionToJSON({
      id: 7,
      sellerId: 4,
      title: 'Item',
      seller: { id: 4, username: 'seller', email: 'private@example.test', password: 'hash' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startsAt: null,
      endsAt: null,
      toJSON() { return this; },
    });
    expect(result.seller).toEqual({ id: 4, username: 'seller' });
    expect(JSON.stringify(result)).not.toMatch(/email|password|hash/i);
  });
});
