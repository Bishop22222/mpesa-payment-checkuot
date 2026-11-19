
const prisma = require("../config/prisma");
const crypto = require("crypto");

// Find the merchant belonging to the authenticated user
async function getMerchant(userId) {
    return prisma.merchant.findFirst({
        where: { ownerId: userId },
        select: { id: true },
    });
}

// Create a payment link
exports.createPaymentLink = async (req, res) => {
    try {
        const { title, description, amount } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            amount === undefined ||
            amount === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Title and amount are required.",
            });
        }

        const numericAmount = Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0 ||
            !/^\d+(\.\d{1,2})?$/.test(String(amount))
        ) {
            return res.status(400).json({
                success: false,
                message: "Amount must be positive and have no more than two decimal places.",
            });
        }

        const merchant = await getMerchant(req.user.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        const slug = crypto.randomBytes(8).toString("hex");

        const paymentLink = await prisma.paymentLink.create({
            data: {
                title: title.trim(),
                description:
                    typeof description === "string"
                        ? description.trim() || null
                        : null,
                amount: numericAmount,
                slug,
                merchantId: merchant.id,
            },
        });

        return res.status(201).json({
            success: true,
            message: "Payment link created successfully.",
            paymentLink,
        });
    } catch (error) {
        console.error("Create payment link error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create payment link.",
        });
    }
};

// List the authenticated merchant's payment links
exports.getPaymentLinks = async (req, res) => {
    try {
        const merchant = await getMerchant(req.user.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        const paymentLinks = await prisma.paymentLink.findMany({
            where: { merchantId: merchant.id },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({
            success: true,
            count: paymentLinks.length,
            paymentLinks,
        });
    } catch (error) {
        console.error("List payment links error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve payment links.",
        });
    }
};

// View one payment link belonging to the merchant
exports.getPaymentLink = async (req, res) => {
    try {
        const merchant = await getMerchant(req.user.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        const paymentLink = await prisma.paymentLink.findFirst({
            where: {
                id: req.params.id,
                merchantId: merchant.id,
            },
        });

        if (!paymentLink) {
            return res.status(404).json({
                success: false,
                message: "Payment link not found.",
            });
        }

        return res.status(200).json({
            success: true,
            paymentLink,
        });
    } catch (error) {
        console.error("Get payment link error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve payment link.",
        });
    }
};

// Update a payment link
exports.updatePaymentLink = async (req, res) => {
    try {
        const { title, description, amount, status } = req.body;

        const merchant = await getMerchant(req.user.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        const existingLink = await prisma.paymentLink.findFirst({
            where: {
                id: req.params.id,
                merchantId: merchant.id,
            },
        });

        if (!existingLink) {
            return res.status(404).json({
                success: false,
                message: "Payment link not found.",
            });
        }

        const data = {};

        if (title !== undefined) {
            if (typeof title !== "string" || !title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Title cannot be empty.",
                });
            }

            data.title = title.trim();
        }

        if (description !== undefined) {
            if (
                description !== null &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Description must be text or null.",
                });
            }

            data.description =
                typeof description === "string"
                    ? description.trim() || null
                    : null;
        }

        if (amount !== undefined) {
            const numericAmount = Number(amount);

            if (
                !Number.isFinite(numericAmount) ||
                numericAmount <= 0 ||
                !/^\d+(\.\d{1,2})?$/.test(String(amount))
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid amount.",
                });
            }

            data.amount = numericAmount;
        }

        if (status !== undefined) {
            if (!["ACTIVE", "INACTIVE", "EXPIRED"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment link status.",
                });
            }

            data.status = status;
        }

        const paymentLink = await prisma.paymentLink.update({
            where: { id: existingLink.id },
            data,
        });

        return res.status(200).json({
            success: true,
            message: "Payment link updated successfully.",
            paymentLink,
        });
    } catch (error) {
        console.error("Update payment link error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update payment link.",
        });
    }
};

// Soft-delete a payment link by deactivating it
exports.deletePaymentLink = async (req, res) => {
    try {
        const merchant = await getMerchant(req.user.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        const existingLink = await prisma.paymentLink.findFirst({
            where: {
                id: req.params.id,
                merchantId: merchant.id,
            },
        });

        if (!existingLink) {
            return res.status(404).json({
                success: false,
                message: "Payment link not found.",
            });
        }

        const paymentLink = await prisma.paymentLink.update({
            where: { id: existingLink.id },
            data: { status: "INACTIVE" },
        });

        return res.status(200).json({
            success: true,
            message: "Payment link deactivated successfully.",
            paymentLink,
        });
    } catch (error) {
        console.error("Delete payment link error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to deactivate payment link.",
        });
    }
};

// Public checkout: retrieve an active payment link by slug
exports.getPublicPaymentLink = async (req, res) => {
    try {
        const paymentLink = await prisma.paymentLink.findFirst({
            where: {
                slug: req.params.slug,
                status: "ACTIVE",
            },
            select: {
                title: true,
                description: true,
                amount: true,
                currency: true,
                slug: true,
            },
        });

        if (!paymentLink) {
            return res.status(404).json({
                success: false,
                message: "Payment link not found or inactive.",
            });
        }

        return res.status(200).json({
            success: true,
            paymentLink,
        });
    } catch (error) {
        console.error("Public payment link error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve payment link.",
        });
    }
};
