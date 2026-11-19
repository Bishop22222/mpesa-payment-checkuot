// Get authenticated merchant profile
exports.me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
                merchants: {
                    select: {
                        id: true,
                        businessName: true,
                        businessEmail: true,
                        phoneNumber: true,
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Merchant account not found.",
            });
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve merchant profile.",
        });
    }
};
