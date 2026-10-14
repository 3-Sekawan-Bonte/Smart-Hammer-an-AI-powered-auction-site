const express = require('express');
const { User } = require('./models');
const { createUserRoutes } = require('./routes/userRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/users', createUserRoutes({ User }));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
