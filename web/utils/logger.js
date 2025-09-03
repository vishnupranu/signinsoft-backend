/**
 * Logger Utility
 * 
 * Provides structured logging for the SignInSoft API
 * using Winston with different transports and formats.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [];

// Console transport for development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat
    })
  );
}

// File transports
transports.push(
  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    level: 'info',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: {
    service: 'signinsoft-api',
    environment: process.env.NODE_ENV || 'development',
    version: require('../package.json').version
  },
  transports,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ],
  exitOnError: false
});

// Add request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

// Database query logger
const logDatabaseQuery = (query, params = [], duration = null) => {
  if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
    logger.debug('Database query', {
      query: query.replace(/\s+/g, ' ').trim(),
      params,
      duration: duration ? `${duration}ms` : null,
      timestamp: new Date().toISOString()
    });
  }
};

// Authentication logger
const logAuthEvent = (event, userId, details = {}) => {
  logger.info('Authentication event', {
    event,
    userId,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Security logger
const logSecurityEvent = (event, details = {}) => {
  logger.warn('Security event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Business logic logger
const logBusinessEvent = (event, details = {}) => {
  logger.info('Business event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Performance logger
const logPerformance = (operation, duration, details = {}) => {
  const logLevel = duration > 1000 ? 'warn' : 'info'; // Warn if operation takes more than 1 second
  
  logger[logLevel]('Performance metric', {
    operation,
    duration: `${duration}ms`,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Email logger
const logEmailEvent = (event, recipient, details = {}) => {
  logger.info('Email event', {
    event,
    recipient,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// File operation logger
const logFileOperation = (operation, filename, details = {}) => {
  logger.info('File operation', {
    operation,
    filename,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// API rate limit logger
const logRateLimit = (ip, endpoint, details = {}) => {
  logger.warn('Rate limit exceeded', {
    ip,
    endpoint,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Cleanup old log files (run periodically)
const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();
  
  fs.readdir(logsDir, (err, files) => {
    if (err) {
      logger.error('Error reading logs directory:', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      
      fs.stat(filePath, (err, stats) => {
        if (err) {
          logger.error(`Error getting stats for ${file}:`, err);
          return;
        }
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error(`Error deleting old log file ${file}:`, err);
            } else {
              logger.info(`Deleted old log file: ${file}`);
            }
          });
        }
      });
    });
  });
};

// Run cleanup on startup and then daily
cleanupLogs();
setInterval(cleanupLogs, 24 * 60 * 60 * 1000); // Run daily

// Export logger and utility functions
module.exports = {
  logger,
  requestLogger,
  logDatabaseQuery,
  logAuthEvent,
  logSecurityEvent,
  logBusinessEvent,
  logPerformance,
  logEmailEvent,
  logFileOperation,
  logRateLimit,
  cleanupLogs
};