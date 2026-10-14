const express = require('express');
const { createUserController } = require('../controllers/userController');
const { createAuthenticate } = require('../middleware/authenticate');

function createUserRoutes(dependencies) {
  const router = express.Router();
  const controller = createUserController(dependencies);
  const authenticate = createAuthenticate(dependencies);
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', authenticate, controller.me);
  return router;
}

module.exports = { createUserRoutes };
