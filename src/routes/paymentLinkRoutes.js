const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");
const {
    createPaymentLink,
    getPaymentLinks,
    getPaymentLink,
    updatePaymentLink,
    deletePaymentLink,
    getPublicPaymentLink,
} = require("../controllers/paymentLinkController");


router.get("/public/:slug", getPublicPaymentLink);

router.use(authenticateToken);

router.post("/", createPaymentLink);
router.get("/", getPaymentLinks);
router.get("/:id", getPaymentLink);
router.patch("/:id", updatePaymentLink);
router.delete("/:id", deletePaymentLink);

module.exports = router;
