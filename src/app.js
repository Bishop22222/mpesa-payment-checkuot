const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// Security headers
app.use(helmet());

// Allow JSON request bodies
app.use(express.json());

// Allow URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Basic CORS configuration
app.use(cors());

// API rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
});

app.use("/api", limiter);

// Health-check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "M-Pesa Checkout API is running",
        environment: process.env.NODE_ENV || "development",
    });
});

module.exports = app;
