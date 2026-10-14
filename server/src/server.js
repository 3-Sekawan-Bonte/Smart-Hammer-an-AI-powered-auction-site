require('dotenv').config();
const app = require('./app');
const { sequelize, Auction, Bid } = require('./models');
const { createAuctionClosureService } = require('./services/auctionClosureService');
const { createAuctionClosureScheduler } = require('./services/auctionClosureScheduler');

const port = Number(process.env.PORT || 3000);
const closureService = createAuctionClosureService({ Auction, Bid, sequelize });
const closureScheduler = createAuctionClosureScheduler({ Auction, closureService });

sequelize.authenticate()
  .then(async () => {
    await closureScheduler.recover();
    closureScheduler.start();
    app.listen(port, () => console.log(`Smart Hammer API listening on port ${port}`));
  })
  .catch(() => {
    console.error('Unable to initialize the server. Check database connectivity and startup recovery.');
    process.exitCode = 1;
  });
