const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');

function createAuthenticate({ User, env = process.env }) {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match || !env.JWT_SECRET) throw new Error('Unauthorized');
      const payload = jwt.verify(match[1], env.JWT_SECRET);
      if (!Number.isInteger(Number(payload.sub)) || Number(payload.sub) < 1) throw new Error('Unauthorized');
      const user = await User.findByPk(Number(payload.sub));
      if (!user) throw new Error('Unauthorized');
      req.user = user;
      return next();
    } catch (_error) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    }
  };
}

module.exports = { createAuthenticate };
