const express = require("express");
const database = require("./database/database");
const bodyparser = require("body-parser");
const routes = require("./router/routes");
require("dotenv").config();

const port = process.env.PORT || 3000;

const app = express();
app.use(bodyparser.json());
app.use('/api/v1', routes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  database();
});
