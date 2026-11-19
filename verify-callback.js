
require("dotenv").config();

const prisma = require("./src/config/prisma");

async function main() {
    const tx = await prisma.transaction.findUnique({
        where: {
            checkoutRequestId: "LOCAL_TEST_1794621200832",
        },
    });

    if (!tx) {
        throw new Error("Test transaction not found.");
    }

    console.log("Status:", tx.status);
    console.log("Receipt:", tx.mpesaReceipt);
    console.log("Result:", tx.resultDescription);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
