
require("dotenv").config();

const prisma = require("./src/config/prisma");

async function main() {
    const link = await prisma.paymentLink.findUnique({
        where: {
            slug: "4012a3708457b801",
        },
    });

    if (!link) {
        throw new Error("Test payment link not found.");
    }

    const transaction = await prisma.transaction.create({
        data: {
            amount: 1,
            phoneNumber: "254708374149",
            status: "PENDING",
            merchantId: link.merchantId,
            paymentLinkId: link.id,
            checkoutRequestId: `LOCAL_TEST_${Date.now()}`,
        },
    });

    console.log("Temporary transaction created.");
    console.log("Checkout Request ID:", transaction.checkoutRequestId);
    console.log("Initial status:", transaction.status);
}

main()
    .catch((error) => {
        console.error("Test transaction creation failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
