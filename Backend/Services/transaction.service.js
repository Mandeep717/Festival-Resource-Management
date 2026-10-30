import mongoose from "mongoose";

export async function runTransaction(work) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
}

export function apiError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export function sendTransactionError(res, error, fallbackMessage) {
    if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: "This record already exists" });
    }
    throw error || new Error(fallbackMessage);
}
