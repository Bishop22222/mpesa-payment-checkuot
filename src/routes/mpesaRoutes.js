


const express = require("express");
const router = express.Router();

const {
    initiatePayment,
    mpesaCallback,
    getPaymentStatus,
    queryPaymentStatus,
} = require("../controllers/mpesaController");

// Public Daraja callback
router.post("/callback", mpesaCallback);

// Public customer checkout
router.post("/public/:slug/stkpush", initiatePayment);

// Check transaction status from database
router.get("/public/status/:checkoutRequestId", getPaymentStatus);

// Ask Daraja to check an existing STK Push
router.post("/public/query/:checkoutRequestId", queryPaymentStatus);

module.exports = router;
