const prisma = require("./src/config/prisma");

async function testDatabase() {
    try {
        await prisma.$connect();
        console.log("Prisma connected successfully!");
    } catch (error) {
        console.error("Database connection failed:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testDatabase();
