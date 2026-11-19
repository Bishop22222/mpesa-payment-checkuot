
const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function generateToken(user) {
    return jwt.sign(
        { role: user.role },
        process.env.JWT_SECRET,
        {
            subject: user.id,
            expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        }
    );
}

// Merchant registration
exports.register = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            password,
            businessName,
            businessEmail,
        } = req.body;

        if (
            !firstName ||
            !lastName ||
            !email ||
            !password ||
            !businessName ||
            !businessEmail
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required.",
            });
        }

        if (password.length < 12) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 12 characters.",
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured.");
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedBusinessEmail = businessEmail.trim().toLowerCase();

        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: normalizedEmail,
                passwordHash,
                merchants: {
                    create: {
                        businessName: businessName.trim(),
                        businessEmail: normalizedBusinessEmail,
                    },
                },
            },
            include: {
                merchants: {
                    select: {
                        id: true,
                        businessName: true,
                        businessEmail: true,
                    },
                },
            },
        });

        const token = generateToken(user);

        return res.status(201).json({
            success: true,
            message: "Merchant account created successfully.",
            token,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                merchants: user.merchants,
            },
        });
    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === "P2002") {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to create account.",
        });
    }
};

// Merchant login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured.");
        }

        const user = await prisma.user.findUnique({
            where: {
                email: email.trim().toLowerCase(),
            },
            include: {
                merchants: {
                    select: {
                        id: true,
                        businessName: true,
                        businessEmail: true,
                    },
                },
            },
        });

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                merchants: user.merchants,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to log in.",
        });
    }
};

// Get authenticated merchant profile
exports.me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
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
