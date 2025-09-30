const express = require("express");
const database = require("./database/database");
const bodyparser = require("body-parser");
const routes = require("./router/routes");
const cors = require("cors");

require("dotenv").config();

const port = process.env.PORT || 3000;

const app = express();

// Permitir CORS para tu frontend
app.use(cors({
  origin: "http://localhost:3000", // donde corre tu frontend
  credentials: true,               // si usas cookies o auth headers
}));

app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);


app.use(bodyparser.json());
app.use('/api/v1', routes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  database();
});
