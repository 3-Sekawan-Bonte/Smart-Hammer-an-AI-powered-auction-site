require('dotenv').config();
const app = require('./app');
const { sequelize, Auction, Bid, AIInteraction } = require('./models');
const { createAuctionClosureService } = require('./services/auctionClosureService');
const { createAuctionClosureScheduler } = require('./services/auctionClosureScheduler');
const { createAIInteractionService } = require('./services/aiInteractionService');

const port = Number(process.env.PORT || 3000);
const closureService = createAuctionClosureService({ Auction, Bid, sequelize });
const closureScheduler = createAuctionClosureScheduler({ Auction, closureService });
const aiInteractionService = createAIInteractionService({ Auction, AIInteraction });

sequelize.authenticate()
  .then(async () => {
    await aiInteractionService.recoverPending();
    await closureScheduler.recover();
    closureScheduler.start();
    app.listen(port, () => console.log(`Smart Hammer API listening on port ${port}`));
  })
  .catch(() => {
    console.error('Unable to initialize the server. Check database connectivity and startup recovery.');
    process.exitCode = 1;
  });
