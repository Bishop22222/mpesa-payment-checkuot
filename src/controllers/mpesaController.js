
const prisma = require("../config/prisma");

const {
    initiateSTKPush,
    normalizePhoneNumber,
    querySTKPush,
} = require("../services/mpesaService");

// Customer requests an M-Pesa payment
exports.initiatePayment = async (req, res) => {
    let transaction;

    try {
        const { phoneNumber } = req.body;
        const { slug } = req.params;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "M-Pesa phone number is required.",
            });
        }

        const phone = normalizePhoneNumber(String(phoneNumber));

        const paymentLink = await prisma.paymentLink.findFirst({
            where: {
                slug,
                status: "ACTIVE",
            },
        });

        if (!paymentLink) {
            return res.status(404).json({
                success: false,
                message: "Payment link not found or inactive.",
            });
        }

        const amount = Number(paymentLink.amount);

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "This payment link must have a positive whole-number KES amount.",
            });
        }

        transaction = await prisma.transaction.create({
            data: {
                amount,
                phoneNumber: phone,
                status: "PENDING",
                merchantId: paymentLink.merchantId,
                paymentLinkId: paymentLink.id,
            },
        });

        const stkResponse = await initiateSTKPush({
            phoneNumber: phone,
            amount,
            accountReference: `PAY${transaction.id.slice(0, 9)}`,
            transactionDesc: paymentLink.title,
        });

        await prisma.transaction.update({
            where: {
                id: transaction.id,
            },
            data: {
                merchantRequestId: stkResponse.MerchantRequestID,
                checkoutRequestId: stkResponse.CheckoutRequestID,
            },
        });

        return res.status(200).json({
            success: true,
            message: "STK Push request accepted.",
            transactionId: transaction.id,
            checkoutRequestId: stkResponse.CheckoutRequestID,
            customerMessage: stkResponse.CustomerMessage,
        });
    } catch (error) {
        console.error("STK Push initiation error:", error.message);

        if (transaction) {
            await prisma.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    status: "FAILED",
                    resultDescription: String(error.message).slice(0, 255),
                },
            }).catch((updateError) => {
                console.error("Transaction update error:", updateError);
            });
        }

        return res.status(502).json({
            success: false,
            message: error.message || "Unable to initiate M-Pesa payment.",
            transactionId: transaction?.id || null,
        });
    }
};


// Safaricom Daraja callback
exports.mpesaCallback = async (req, res) => {
    try {
        const callback = req.body?.Body?.stkCallback;

        if (
            !callback ||
            typeof callback.CheckoutRequestID !== "string" ||
            !callback.CheckoutRequestID.trim()
        ) {
            return res.status(400).json({
                ResultCode: 1,
                ResultDesc: "Invalid callback data.",
            });
        }

        const checkoutRequestId = callback.CheckoutRequestID.trim();

        const transaction = await prisma.transaction.findUnique({
            where: {
                checkoutRequestId,
            },
        });

        if (!transaction) {
            console.error(
                "Callback received for unknown checkout request:",
                checkoutRequestId
            );

            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Callback received.",
            });
        }

        // Ignore duplicate or late callbacks.
        if (transaction.status !== "PENDING") {
            console.log(
                `Duplicate or late callback ignored: ${transaction.id}`
            );

            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Transaction already processed.",
            });
        }

        const rawResultCode = callback.ResultCode;

        if (
            rawResultCode === undefined ||
            rawResultCode === null ||
            !/^\d+$/.test(String(rawResultCode))
        ) {
            return res.status(400).json({
                ResultCode: 1,
                ResultDesc: "Invalid transaction result code.",
            });
        }

        const resultCode = String(rawResultCode);
        const successful = resultCode === "0";

        // Failed payments normally do not contain success metadata.
        if (!successful) {
            const updateResult = await prisma.transaction.updateMany({
                where: {
                    id: transaction.id,
                    status: "PENDING",
                },
                data: {
                    status: "FAILED",
                    resultCode,
                    resultDescription: String(
                        callback.ResultDesc || "M-Pesa payment failed."
                    ).slice(0, 255),
                },
            });

            console.log(
                updateResult.count
                    ? `M-Pesa transaction ${transaction.id}: FAILED`
                    : `Transaction already processed: ${transaction.id}`
            );

            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: updateResult.count
                    ? "Failed payment callback processed."
                    : "Transaction already processed.",
            });
        }

        // Successful callbacks must contain payment metadata.
        const items = callback.CallbackMetadata?.Item;

        if (!Array.isArray(items)) {
            console.error(
                "Successful callback has missing metadata:",
                transaction.id
            );

            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Callback received but payment is awaiting verification.",
            });
        }

        const getMetadataValue = (name) => {
            const item = items.find(
                (entry) => entry?.Name === name
            );

            return item?.Value;
        };

        const amountValue = getMetadataValue("Amount");
        const receiptValue = getMetadataValue("MpesaReceiptNumber");
        const phoneValue = getMetadataValue("PhoneNumber");

        const callbackAmount = Number(amountValue);
        const receipt = String(receiptValue || "").trim();

        let callbackPhone = null;

        try {
            if (phoneValue !== undefined && phoneValue !== null) {
                callbackPhone = normalizePhoneNumber(String(phoneValue));
            }
        } catch {
            callbackPhone = null;
        }

        // Verify the callback against the original payment.
        const amountMatches =
            amountValue !== undefined &&
            amountValue !== null &&
            Number.isFinite(callbackAmount) &&
            callbackAmount === Number(transaction.amount);

        const phoneMatches =
            Boolean(callbackPhone) &&
            callbackPhone === transaction.phoneNumber;

        if (!amountMatches || !phoneMatches || !receipt) {
            console.error(
                "Successful callback failed payment verification:",
                transaction.id
            );

            // Keep the transaction pending for further verification.
            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Callback received but payment is awaiting verification.",
            });
        }

        // Atomic update: only a pending transaction can become successful.
        const updateResult = await prisma.transaction.updateMany({
            where: {
                id: transaction.id,
                status: "PENDING",
            },
            data: {
                status: "SUCCESS",
                resultCode,
                resultDescription: String(
                    callback.ResultDesc || "M-Pesa payment successful."
                ).slice(0, 255),
                mpesaReceipt: receipt,
            },
        });

        if (updateResult.count === 0) {
            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Transaction already processed.",
            });
        }

        console.log(
            `M-Pesa transaction ${transaction.id}: SUCCESS`
        );

        return res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Callback processed successfully.",
        });
    } catch (error) {
        console.error("M-Pesa callback processing error:", error);

        return res.status(500).json({
            ResultCode: 1,
            ResultDesc: "Callback processing failed.",
        });
    }
};


// Customer checks payment status from the database
exports.getPaymentStatus = async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        const transaction = await prisma.transaction.findUnique({
            where: {
                checkoutRequestId,
            },
            select: {
                status: true,
                amount: true,
                phoneNumber: true,
                mpesaReceipt: true,
                resultDescription: true,
                createdAt: true,
            },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        return res.status(200).json({
            success: true,
            transaction,
        });
    } catch (error) {
        console.error("Payment status error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve payment status.",
        });
    }
};


// Query Daraja for the latest status of an existing STK Push
exports.queryPaymentStatus = async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        if (!checkoutRequestId) {
            return res.status(400).json({
                success: false,
                message: "Checkout Request ID is required.",
            });
        }

        const transaction = await prisma.transaction.findUnique({
            where: {
                checkoutRequestId,
            },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        // Do not query transactions already processed.
        if (transaction.status !== "PENDING") {
            return res.status(200).json({
                success: true,
                message: "Transaction has already been processed.",
                status: transaction.status,
                resultDescription: transaction.resultDescription,
                mpesaReceipt: transaction.mpesaReceipt,
            });
        }

        const darajaResponse = await querySTKPush(checkoutRequestId);

        if (String(darajaResponse.ResponseCode) !== "0") {
            return res.status(502).json({
                success: false,
                message:
                    darajaResponse.ResponseDescription ||
                    darajaResponse.errorMessage ||
                    "Daraja could not process the status query.",
            });
        }

        // No result means Daraja has not returned a final outcome.
        if (
            darajaResponse.ResultCode === undefined ||
            darajaResponse.ResultCode === null
        ) {
            return res.status(200).json({
                success: true,
                message: "Payment is still being processed.",
                status: "PENDING",
                checkoutRequestId,
            });
        }

        const resultCode = String(darajaResponse.ResultCode);

        // A successful query result still needs the callback metadata
        // to verify the amount, phone number and M-Pesa receipt.
        if (resultCode === "0") {
            return res.status(200).json({
                success: true,
                message: "Daraja reports success. Waiting for the verified payment callback.",
                status: "PENDING",
                checkoutRequestId,
            });
        }

        // A non-zero result indicates a failed payment.
        const updateResult = await prisma.transaction.updateMany({
            where: {
                id: transaction.id,
                status: "PENDING",
            },
            data: {
                status: "FAILED",
                resultCode,
                resultDescription: String(
                    darajaResponse.ResultDesc ||
                    "Daraja reported that the payment failed."
                ).slice(0, 255),
            },
        });

        const latestTransaction = await prisma.transaction.findUnique({
            where: {
                id: transaction.id,
            },
            select: {
                status: true,
                amount: true,
                phoneNumber: true,
                mpesaReceipt: true,
                resultCode: true,
                resultDescription: true,
                createdAt: true,
            },
        });

        console.log(
            `STK Query ${transaction.id}: ${latestTransaction.status}`
        );

        return res.status(200).json({
            success: true,
            message: updateResult.count
                ? "Payment failure confirmed."
                : "Transaction was already processed.",
            transaction: latestTransaction,
        });
    } catch (error) {
        console.error("STK Push Query error:", error.message);

        return res.status(502).json({
            success: false,
            message: error.message ||
                "Unable to query M-Pesa payment status.",
        });
    }
};
