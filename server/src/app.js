const express = require('express');
const models = require('./models');
const { createUserRoutes } = require('./routes/userRoutes');
const { createAuctionRoutes } = require('./routes/auctionRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/users', createUserRoutes(models));
app.use('/auctions', createAuctionRoutes(models));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
