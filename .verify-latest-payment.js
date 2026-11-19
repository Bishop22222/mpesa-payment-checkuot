require("dotenv").config();

const prisma = require("./src/config/prisma");

async function main() {
    const checkoutRequestId =
        "ws_CO_141120260524568708374149";

    const transaction = await prisma.transaction.findUnique({
        where: {
            checkoutRequestId,
        },
    });

    if (!transaction) {
        console.log("Transaction not found.");
        return;
    }

    console.log("Latest checkout verification");
    console.log("-----------------------------");
    console.log("Transaction ID:", transaction.id);
    console.log("Amount:", transaction.amount.toString());
    console.log("Status:", transaction.status);
    console.log("Receipt:", transaction.mpesaReceipt || "Not received");
    console.log("Result code:", transaction.resultCode || "Not received");
    console.log("Result description:", transaction.resultDescription || "Not received");
    console.log("Created:", transaction.createdAt);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
    