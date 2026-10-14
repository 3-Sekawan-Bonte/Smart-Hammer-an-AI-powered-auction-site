require('dotenv').config();
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
const dependencies = { sequelize, User, Auction, Bid, AIInteraction, eventPublisher, auctioneer };

const httpServer = http.createServer(app.createApp(dependencies));
const io = createSocketServer(httpServer, dependencies);
eventPublisher.attach(io);

const closureService = createAuctionClosureService({ ...dependencies });
const closureScheduler = createAuctionClosureScheduler({ Auction, closureService });
const aiInteractionService = createAIInteractionService({ Auction, AIInteraction });

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
