require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const port = Number(process.env.PORT || 3000);
sequelize.authenticate()
  .then(() => app.listen(port, () => console.log(`Smart Hammer API listening on port ${port}`)))
  .catch(() => {
    console.error('Unable to connect to the configured database.');
    process.exitCode = 1;
  });
