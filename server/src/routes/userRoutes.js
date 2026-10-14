const express = require('express');
const { createUserController } = require('../controllers/userController');
const { createAuthenticate } = require('../middleware/authenticate');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createUserRoutes(dependencies) {
  const router = express.Router();
  const controller = createUserController(dependencies);
  const authenticate = createAuthenticate(dependencies);
  router.post('/register', asyncRoute(controller.register));
  router.post('/login', asyncRoute(controller.login));
  router.get('/me', asyncRoute(authenticate), asyncRoute(controller.me));
  return router;
}

module.exports = { createUserRoutes };
