const mongoose = require('mongoose')
require('dotenv').config();

const connectDB = async () => {
    try {
        // Use DATABASE_URL as primary, but allow it to be overridden
        // The api/index.js file sets this for Vercel deployment
        const dbUrl = process.env.DATABASE_URL;
        
        const conn = await mongoose.connect(dbUrl, {});
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`MongoDB Connected: ${conn.connection.name}`);

    } catch (err) {
        console.log(err);
        process.exit(1);
    }
};

module.exports = connectDB;