export function validateAIQuestion(value) {
  if (typeof value !== 'string') return { valid: false, error: 'required' };
  const length = value.trim().length;
  if (!length) return { valid: false, error: 'required' };
  if (length < 3) return { valid: false, error: 'too_short' };
  if (length > 500) return { valid: false, error: 'too_long' };
  return { valid: true, error: null };
}
