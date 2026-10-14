const HttpError = require('../utils/httpError');
const { verifyAccessToken } = require('../utils/verifyAccessToken');

function createAuthenticate({ User, env = process.env }) {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match) throw new Error('Unauthorized');
      const user = await User.findByPk(verifyAccessToken(match[1], env));
      if (!user) throw new Error('Unauthorized');
      req.user = user;
      return next();
    } catch (_error) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    }
  };
}

module.exports = { createAuthenticate };
