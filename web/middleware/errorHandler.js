/**
 * Error Handling Middleware
 * 
 * Provides centralized error handling for the SignInSoft API
 * with consistent error responses and logging.
 */

const { logger } = require('../utils/logger');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = 'ApiError';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for validation errors
 */
class ValidationError extends ApiError {
  constructor(message, details = []) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Custom error class for authentication errors
 */
class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Custom error class for authorization errors
 */
class AuthorizationError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Custom error class for not found errors
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Custom error class for conflict errors
 */
class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Custom error class for rate limiting errors
 */
class RateLimitError extends ApiError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Format error response based on error type
 */
const formatErrorResponse = (error, req) => {
  const response = {
    error: error.name || 'Error',
    message: error.message || 'An error occurred',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };
  
  // Add additional details for specific error types
  if (error.name === 'ValidationError' && error.details) {
    response.details = error.details;
  }
  
  if (error.name === 'AuthorizationError' && error.requiredRoles) {
    response.requiredRoles = error.requiredRoles;
    response.userRole = error.userRole;
  }
  
  if (error.name === 'AuthorizationError' && error.requiredPermissions) {
    response.requiredPermissions = error.requiredPermissions;
    response.userPermissions = error.userPermissions;
  }
  
  // Add request ID if available
  if (req.id) {
    response.requestId = req.id;
  }
  
  // In development, include stack trace
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.stack = error.stack;
  }
  
  return response;
};

/**
 * Handle database errors
 */
const handleDatabaseError = (error) => {
  let apiError;
  
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      apiError = new ConflictError('Duplicate entry. This resource already exists.');
      break;
    case 'ER_NO_REFERENCED_ROW_2':
      apiError = new ValidationError('Invalid reference. The referenced resource does not exist.');
      break;
    case 'ER_ROW_IS_REFERENCED_2':
      apiError = new ConflictError('Cannot delete resource. It is referenced by other resources.');
      break;
    case 'ER_DATA_TOO_LONG':
      apiError = new ValidationError('Data too long for field.');
      break;
    case 'ER_BAD_NULL_ERROR':
      apiError = new ValidationError('Required field cannot be null.');
      break;
    case 'ER_ACCESS_DENIED_ERROR':
      apiError = new ApiError('Database access denied', 500);
      break;
    case 'ECONNREFUSED':
      apiError = new ApiError('Database connection refused', 503);
      break;
    case 'ETIMEDOUT':
      apiError = new ApiError('Database connection timeout', 503);
      break;
    default:
      apiError = new ApiError('Database error occurred', 500);
  }
  
  return apiError;
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error) => {
  switch (error.name) {
    case 'JsonWebTokenError':
      return new AuthenticationError('Invalid token');
    case 'TokenExpiredError':
      return new AuthenticationError('Token expired');
    case 'NotBeforeError':
      return new AuthenticationError('Token not active');
    default:
      return new AuthenticationError('Token verification failed');
  }
};

/**
 * Handle Joi validation errors
 */
const handleJoiError = (error) => {
  const details = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value
  }));
  
  return new ValidationError('Validation failed', details);
};

/**
 * Handle Multer errors (file upload)
 */
const handleMulterError = (error) => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ValidationError('File too large');
    case 'LIMIT_FILE_COUNT':
      return new ValidationError('Too many files');
    case 'LIMIT_UNEXPECTED_FILE':
      return new ValidationError('Unexpected file field');
    case 'LIMIT_PART_COUNT':
      return new ValidationError('Too many parts');
    case 'LIMIT_FIELD_KEY':
      return new ValidationError('Field name too long');
    case 'LIMIT_FIELD_VALUE':
      return new ValidationError('Field value too long');
    case 'LIMIT_FIELD_COUNT':
      return new ValidationError('Too many fields');
    default:
      return new ValidationError('File upload error');
  }
};

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
  let apiError = error;
  
  // Convert known errors to ApiError instances
  if (!(error instanceof ApiError)) {
    // Database errors
    if (error.code && error.code.startsWith('ER_')) {
      apiError = handleDatabaseError(error);
    }
    // JWT errors
    else if (error.name && error.name.includes('Token')) {
      apiError = handleJWTError(error);
    }
    // Joi validation errors
    else if (error.name === 'ValidationError' && error.isJoi) {
      apiError = handleJoiError(error);
    }
    // Multer errors
    else if (error.code && error.code.startsWith('LIMIT_')) {
      apiError = handleMulterError(error);
    }
    // Syntax errors
    else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      apiError = new ValidationError('Invalid JSON in request body');
    }
    // Generic errors
    else {
      apiError = new ApiError(
        process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        500,
        false
      );
    }
  }
  
  // Log error
  const logLevel = apiError.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('API Error:', {
    name: apiError.name,
    message: apiError.message,
    statusCode: apiError.statusCode,
    path: req.originalUrl,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    stack: apiError.stack
  });
  
  // Format and send error response
  const errorResponse = formatErrorResponse(apiError, req);
  
  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && apiError.statusCode >= 500) {
    errorResponse.message = 'Internal server error';
    delete errorResponse.stack;
  }
  
  res.status(apiError.statusCode).json(errorResponse);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass them to error handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};