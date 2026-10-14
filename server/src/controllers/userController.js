const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateAuthBody } = require('../utils/validation');
const HttpError = require('../utils/httpError');

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email };
}

function createUserController({ User, env = process.env }) {
  return {
    register: async (req, res) => {
      const { username, email, password } = validateAuthBody(req.body, ['username', 'email', 'password'], 'register');
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        const user = await User.create({ username, email, password: passwordHash });
        return res.status(201).json({ message: 'User registered successfully.', data: { user: publicUser(user) } });
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.', { email: 'Email is already registered.' });
        }
        throw error;
      }
    },
    login: async (req, res) => {
      const { email, password } = validateAuthBody(req.body, ['email', 'password'], 'login');
      const user = await User.scope('withPassword').findOne({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
      const accessToken = jwt.sign({ sub: String(user.id) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN || '7d' });
      return res.json({ message: 'Login successful.', data: { user: publicUser(user), accessToken } });
    },
    me: async (req, res) => res.json({ message: 'Authenticated user retrieved successfully.', data: { user: publicUser(req.user) } }),
  };
}

module.exports = { createUserController, publicUser };
