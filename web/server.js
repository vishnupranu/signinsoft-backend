/**
 * SignInSoft Backend API Server
 * 
 * Main Express server with authentication, middleware, and API routes
 * for the SignInSoft HR Management System.
 */

console.log('Starting server...');
const express = require('express');
console.log('Express loaded');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
console.log('Basic modules loaded');

// Import database connection
console.log('Loading database config...');
const db = require('./config/database');
console.log('Database config loaded');

// Import routes
console.log('Loading routes...');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const companyRoutes = require('./routes/companies');
const contentRoutes = require('./routes/content');
const projectRoutes = require('./routes/projects');
const calendarRoutes = require('./routes/calendar');
const dashboardRoutes = require('./routes/dashboard');
const uploadRoutes = require('./routes/uploads');
console.log('Routes loaded');

// Import middleware
console.log('Loading middleware...');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const { validateRequest } = require('./middleware/validation');
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');
console.log('Middleware loaded');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Compression middleware
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:8081'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Session configuration
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'signinsoft_db',
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
});

app.use(session({
  key: 'signinsoft_session',
  secret: process.env.SESSION_SECRET || 'dev_session_secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version
  });
});

// API documentation (Swagger)
if (process.env.ENABLE_SWAGGER === 'true') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerJsdoc = require('swagger-jsdoc');
  
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'SignInSoft API',
        version: '1.0.0',
        description: 'HR Management System API Documentation',
        contact: {
          name: 'SignInSoft Team',
          email: 'support@signinsoft.com'
        }
      },
      servers: [
        {
          url: `http://localhost:${PORT}/api`,
          description: 'Development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    },
    apis: ['./routes/*.js', './models/*.js']
  };
  
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', authenticateToken, applicationRoutes);
app.use('/api/companies', authenticateToken, companyRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/projects', authenticateToken, projectRoutes);
app.use('/api/calendar', authenticateToken, calendarRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SignInSoft API Server',
    version: require('./package.json').version,
    documentation: process.env.ENABLE_SWAGGER === 'true' ? '/api-docs' : 'Not available',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      jobs: '/api/jobs',
      applications: '/api/applications',
      companies: '/api/companies',
      content: '/api/content',
      projects: '/api/projects',
      calendar: '/api/calendar',
      dashboard: '/api/dashboard',
      upload: '/api/upload'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: [
      '/health',
      '/api/auth',
      '/api/users',
      '/api/jobs',
      '/api/applications',
      '/api/companies',
      '/api/content',
      '/api/projects',
      '/api/calendar',
      '/api/dashboard',
      '/api/upload'
    ]
  });
});

// Global error handler
app.use(errorHandler);

// Database connection test
async function testDatabaseConnection() {
  try {
    const connection = await createConnection(true);
    await connection.execute('SELECT 1');
    await connection.end();
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    logger.warn('Server will start but database operations will fail');
    return false;
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await testDatabaseConnection();
    
    // Create necessary directories
    const dirs = ['uploads', 'uploads/profiles', 'uploads/resumes', 'uploads/documents', 'logs'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
    
    // Start listening
    app.listen(PORT, () => {
      logger.info(`SignInSoft API Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      
      if (process.env.ENABLE_SWAGGER === 'true') {
        logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
      }
      
      console.log(`\n🚀 SignInSoft API Server is running!`);
      console.log(`📍 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      
      if (process.env.ENABLE_SWAGGER === 'true') {
        console.log(`📚 Docs: http://localhost:${PORT}/api-docs`);
      }
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;