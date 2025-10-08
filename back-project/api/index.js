// Serverless entry point for Vercel
const express = require("express");
const database = require("../src/database/database");
const bodyparser = require("body-parser");
const routes = require("../src/router/routes");
const cors = require("cors");

require("dotenv").config();

// Use the development database URL for Vercel deployment
// This will override the DATABASE_URL from the .env file
if (process.env.VERCEL_ENV) {
  process.env.DATABASE_URL = process.env.DEPLOY_DATABASE_URL;
}

const app = express();

// Enable CORS for all origins in production
app.use(cors({
  origin: process.env.VERCEL_ENV ? "*" : "http://localhost:3000",
  credentials: true,
}));

app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);

app.use(bodyparser.json());
app.use('/api/v1', routes);

// Connect to database
database();

// Export for Vercel serverless deployment
module.exports = app;