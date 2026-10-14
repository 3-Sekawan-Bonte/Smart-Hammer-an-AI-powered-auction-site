const WINDOW_MS = 10_000;

function createAIQuestionRateLimiter({ clock = () => Date.now(), windowMs = WINDOW_MS } = {}) {
  const lastQuestionAt = new Map();
  return {
    consume(userId) {
      const now = clock();
      for (const [id, timestamp] of lastQuestionAt) {
        if (now - timestamp >= windowMs) lastQuestionAt.delete(id);
      }
      const previous = lastQuestionAt.get(userId);
      if (previous !== undefined && now - previous < windowMs) return false;
      lastQuestionAt.set(userId, now);
      return true;
    },
  };
}

module.exports = { WINDOW_MS, createAIQuestionRateLimiter };
