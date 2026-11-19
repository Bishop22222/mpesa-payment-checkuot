
const crypto = require("crypto");

const environment = process.env.MPESA_ENVIRONMENT || "sandbox";

const baseUrl =
    environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

// Generate Daraja access token
async function getAccessToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
        throw new Error("Daraja consumer credentials are missing.");
    }

    const credentials = Buffer.from(
        `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const response = await fetch(
        `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
            method: "GET",
            headers: {
                Authorization: `Basic ${credentials}`,
            },
        }
    );

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        throw new Error(
            data.errorMessage || "Unable to obtain Daraja access token."
        );
    }

    return data.access_token;
}

// Format date for Daraja password generation
function getTimestamp() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        values[part.type] = part.value;
    }

    return (
        values.year +
        values.month +
        values.day +
        values.hour +
        values.minute +
        values.second
    );
}

// Normalize Kenyan phone numbers
function normalizePhoneNumber(phoneNumber) {
    let phone = String(phoneNumber).replace(/[\s+-]/g, "");

    if (/^0[17]\d{8}$/.test(phone)) {
        phone = `254${phone.slice(1)}`;
    }

    if (/^[17]\d{8}$/.test(phone)) {
        phone = `254${phone}`;
    }

    if (!/^254[17]\d{8}$/.test(phone)) {
        throw new Error("Enter a valid Kenyan M-Pesa phone number.");
    }

    return phone;
}

// Initiate M-Pesa STK Push
async function initiateSTKPush({
    phoneNumber,
    amount,
    accountReference,
    transactionDesc,
}) {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (!shortcode || !passkey || !callbackUrl) {
        throw new Error(
            "Shortcode, passkey or callback URL is missing."
        );
    }

    const numericAmount = Number(amount);

    if (
        !Number.isSafeInteger(numericAmount) ||
        numericAmount <= 0
    ) {
        throw new Error(
            "M-Pesa STK Push amount must be a positive whole number."
        );
    }

    const phone = normalizePhoneNumber(phoneNumber);
    const timestamp = getTimestamp();

    const password = Buffer.from(
        `${shortcode}${passkey}${timestamp}`
    ).toString("base64");

    const accessToken = await getAccessToken();

    const payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType:
            process.env.MPESA_TRANSACTION_TYPE ||
            "CustomerPayBillOnline",
        Amount: numericAmount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: String(accountReference).slice(0, 12),
        TransactionDesc: String(transactionDesc).slice(0, 13),
    };

    const response = await fetch(
        `${baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    const data = await response.json();

    if (!response.ok || data.ResponseCode !== "0") {
        throw new Error(
            data.errorMessage ||
            data.ResponseDescription ||
            "Daraja STK Push request failed."
        );
    }

    return data;
}

// Query the status of an existing STK Push
async function querySTKPush(checkoutRequestId) {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;

    if (!shortcode || !passkey) {
        throw new Error("Shortcode or passkey is missing.");
    }

    if (!checkoutRequestId) {
        throw new Error("Checkout Request ID is required.");
    }

    const timestamp = getTimestamp();

    const password = Buffer.from(
        `${shortcode}${passkey}${timestamp}`
    ).toString("base64");

    const accessToken = await getAccessToken();

    const payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
    };

    const response = await fetch(
        `${baseUrl}/mpesa/stkpushquery/v1/query`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    const data = await response.json();

    if (!response.ok || data.ResponseCode !== "0") {
    console.error("Daraja query HTTP status:", response.status);
    console.error("Daraja query response:", data);

    throw new Error(
        data.errorMessage ||
        data.errorDescription ||
        data.ResponseDescription ||
        data.ResponseDesc ||
        `Daraja query failed with HTTP status ${response.status}.`
    );
}

    return data;
}

module.exports = {
    getAccessToken,
    normalizePhoneNumber,
    initiateSTKPush,
    querySTKPush,
};



