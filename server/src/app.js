const express = require('express');
const models = require('./models');
const { createUserRoutes } = require('./routes/userRoutes');
const { createAuctionRoutes } = require('./routes/auctionRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { createCorsMiddleware } = require('./middleware/cors');

function createApp(dependencies = models) {
  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware(dependencies.env || process.env));
  app.use(express.json({ limit: '16kb' }));
  app.use('/users', createUserRoutes(dependencies));
  app.use('/auctions', createAuctionRoutes(dependencies));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = createApp();
app.createApp = createApp;
module.exports = app;
