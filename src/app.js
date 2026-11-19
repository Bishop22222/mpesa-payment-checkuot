
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const prisma = require("./config/prisma");
const authRoutes = require("./routes/authRoutes");
const paymentLinkRoutes = require("./routes/paymentLinkRoutes");
const mpesaRoutes = require("./routes/mpesaRoutes");

const app = express();

// Security and request middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/payment-links", paymentLinkRoutes);
app.use("/api/mpesa", mpesaRoutes);

// API rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
});

// Apply rate limiting before API routes
app.use("/api", limiter);

// Authentication routes
app.use("/api/auth", authRoutes);

// Payment link routes
app.use("/api/payment-links", paymentLinkRoutes);

// Basic API health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "M-Pesa Checkout API is running",
        environment: process.env.NODE_ENV || "development",
    });
});

// Database health check
app.get("/api/health/db", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.status(200).json({
            success: true,
            message: "Database connection is healthy",
        });
    } catch (error) {
        console.error("Database health check failed:", error);

        res.status(503).json({
            success: false,
            message: "Database connection unavailable",
        });
    }
});

module.exports = app;
