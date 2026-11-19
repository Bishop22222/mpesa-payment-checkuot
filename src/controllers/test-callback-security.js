
require("dotenv").config();

const prisma = require("../config/prisma");

const BASE_URL = "http://localhost:5000";
const TEST_PHONE = "254708374149";
const TEST_SLUG = "4012a3708457b801";

async function sendCallback(checkoutRequestId, resultCode, metadata = []) {
    const response = await fetch(`${BASE_URL}/api/mpesa/callback`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            Body: {
                stkCallback: {
                    CheckoutRequestID: checkoutRequestId,
                    ResultCode: resultCode,
                    ResultDesc: resultCode === 0
                        ? "The service request is processed successfully."
                        : "The transaction was cancelled.",
                    CallbackMetadata: {
                        Item: metadata,
                    },
                },
            },
        }),
    });

    return response.json();
}

async function createTestTransaction(link, suffix) {
    return prisma.transaction.create({
        data: {
            amount: 1,
            phoneNumber: TEST_PHONE,
            status: "PENDING",
            merchantId: link.merchantId,
            paymentLinkId: link.id,
            checkoutRequestId: `SECURITY_${suffix}_${Date.now()}`,
        },
    });
}

function successMetadata(receipt) {
    return [
        { Name: "Amount", Value: 1 },
        { Name: "MpesaReceiptNumber", Value: receipt },
        { Name: "PhoneNumber", Value: Number(TEST_PHONE) },
    ];
}

async function main() {
    const link = await prisma.paymentLink.findUnique({
        where: {
            slug: TEST_SLUG,
        },
    });

    if (!link) {
        throw new Error("Test payment link not found.");
    }

    // TEST 1: Successful callback
    const successTx = await createTestTransaction(link, "SUCCESS");

    await sendCallback(
        successTx.checkoutRequestId,
        0,
        successMetadata("SECURETEST001")
    );

    let saved = await prisma.transaction.findUnique({
        where: { id: successTx.id },
    });

    if (saved.status !== "SUCCESS" || saved.mpesaReceipt !== "SECURETEST001") {
        throw new Error("TEST 1 FAILED: Successful callback was not saved.");
    }

    console.log("PASS: Successful callback updates the database.");

    // TEST 2: Duplicate callback cannot overwrite SUCCESS
    await sendCallback(
        successTx.checkoutRequestId,
        1032
    );

    saved = await prisma.transaction.findUnique({
        where: { id: successTx.id },
    });

    if (saved.status !== "SUCCESS") {
        throw new Error("TEST 2 FAILED: Duplicate callback changed SUCCESS.");
    }

    console.log("PASS: Duplicate callback cannot overwrite SUCCESS.");

    // TEST 3: Failed callback
    const failedTx = await createTestTransaction(link, "FAILED");

    await sendCallback(
        failedTx.checkoutRequestId,
        1032
    );

    saved = await prisma.transaction.findUnique({
        where: { id: failedTx.id },
    });

    if (saved.status !== "FAILED") {
        throw new Error("TEST 3 FAILED: Failed callback was not saved.");
    }

    console.log("PASS: Failed callback updates the database.");

    // TEST 4: Late success cannot overwrite FAILED
    await sendCallback(
        failedTx.checkoutRequestId,
        0,
        successMetadata("SECURETEST002")
    );

    saved = await prisma.transaction.findUnique({
        where: { id: failedTx.id },
    });

    if (saved.status !== "FAILED") {
        throw new Error("TEST 4 FAILED: Late callback changed FAILED.");
    }

    console.log("PASS: Late success callback cannot overwrite FAILED.");

    console.log("\nALL FOUR CALLBACK SECURITY TESTS PASSED.");
}

main()
    .catch((error) => {
        console.error("\nCALLBACK SECURITY TEST FAILED:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
