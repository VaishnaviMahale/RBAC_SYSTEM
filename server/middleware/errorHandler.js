const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
        console.error('Error Stack:', err.stack);
    }

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = {
            message,
            statusCode: 404
        };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        let message = 'Duplicate field value entered';

        // Extract field name from error
        const field = Object.keys(err.keyValue)[0];
        const value = err.keyValue[field];

        if (field === 'email') {
            message = `User with email '${value}' already exists`;
        } else if (field === 'licenseNumber') {
            message = `Doctor with license number '${value}' already exists`;
        } else {
            message = `Duplicate ${field}: '${value}'`;
        }

        error = {
            message,
            statusCode: 400
        };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = {
            message,
            statusCode: 400
        };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = {
            message,
            statusCode: 401
        };
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = {
            message,
            statusCode: 401
        };
    }

    // MongoDB connection errors
    if (err.name === 'MongoNetworkError') {
        const message = 'Database connection failed';
        error = {
            message,
            statusCode: 500
        };
    }

    // Custom application errors
    if (err.name === 'AppointmentConflictError') {
        error = {
            message: err.message || 'Appointment time conflicts with existing appointment',
            statusCode: 409
        };
    }

    if (err.name === 'UnauthorizedError') {
        error = {
            message: err.message || 'Unauthorized access',
            statusCode: 401
        };
    }

    // File upload errors
    if (err.name === 'MulterError') {
        let message = 'File upload error';

        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Unexpected field';
        }

        error = {
            message,
            statusCode: 400
        };
    }

    // Rate limiting errors
    if (err.status === 429) {
        error = {
            message: 'Too many requests, please try again later',
            statusCode: 429
        };
    }

    const statusCode = error.statusCode || err.statusCode || 500;
    const message = error.message || 'Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            details: err
        })
    });
};

// Custom error class
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    errorHandler,
    AppError,
    asyncHandler
};