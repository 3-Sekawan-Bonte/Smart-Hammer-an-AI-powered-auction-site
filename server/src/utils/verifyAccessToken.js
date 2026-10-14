const jwt = require('jsonwebtoken');

function verifyAccessToken(token, env = process.env) {
  if (typeof token !== 'string' || !token || !env.JWT_SECRET) throw new Error('Unauthorized');
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (!payload || !Number.isInteger(Number(payload.sub)) || Number(payload.sub) < 1) {
    throw new Error('Unauthorized');
  }
  return Number(payload.sub);
}

module.exports = { verifyAccessToken };
