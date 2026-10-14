if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const http = require('node:http');
const app = require('./app');
const { sequelize, User, Auction, Bid, AIInteraction } = require('./models');
const { createAuctionClosureService } = require('./services/auctionClosureService');
const { createAuctionClosureScheduler } = require('./services/auctionClosureScheduler');
const { createAIInteractionService } = require('./services/aiInteractionService');
const { createAuctioneerService } = require('./services/auctioneerService');
const { createAuctionEventPublisher } = require('./socket/auctionEventPublisher');
const { createSocketServer } = require('./socket/createSocketServer');

const port = Number(process.env.PORT || 3000);

const eventPublisher = createAuctionEventPublisher();
const auctioneer = createAuctioneerService({ AIInteraction, eventPublisher });
const dependencies = { sequelize, User, Auction, Bid, AIInteraction, eventPublisher, auctioneer, env: process.env };

const httpServer = http.createServer(app.createApp(dependencies));
const allowedOrigins = String(process.env.CLIENT_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const io = createSocketServer(httpServer, dependencies, {
  cors: { origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), methods: ['GET', 'POST'] },
});
eventPublisher.attach(io);

const closureService = createAuctionClosureService({ ...dependencies });
const closureScheduler = createAuctionClosureScheduler({ Auction, closureService });
const aiInteractionService = createAIInteractionService({ Auction, AIInteraction, eventPublisher });

sequelize.authenticate()
  .then(async () => {
    await aiInteractionService.recoverPending();
    await closureScheduler.recover();
    closureScheduler.start();
    httpServer.listen(port, () => console.log(`Smart Hammer API listening on port ${port}`));
  })
  .catch(() => {
    console.error('Unable to initialize the server. Check database connectivity and startup recovery.');
    process.exitCode = 1;
  });
