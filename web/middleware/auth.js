/**
 * Authentication and Authorization Middleware
 * 
 * Provides JWT token validation and role-based access control
 * for the SignInSoft API endpoints.
 */

const jwt = require('jsonwebtoken');
const { createConnection } = require('../setup-database');
const { logger } = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 * Validates the token and adds user information to the request object
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user details from database
    const connection = await createConnection(true);
    const [users] = await connection.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.email_verified, 
              u.is_active, u.created_at, r.name as role_name, r.permissions
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ? AND u.is_active = true`,
      [decoded.userId]
    );
    
    await connection.end();
    
    if (users.length === 0) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token or user not found'
      });
    }
    
    const user = users[0];
    
    // Parse permissions if they exist
    let permissions = [];
    if (user.permissions) {
      try {
        permissions = JSON.parse(user.permissions);
      } catch (error) {
        logger.warn(`Failed to parse permissions for user ${user.id}:`, error.message);
      }
    }
    
    // Add user info to request object
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role_name,
      permissions: permissions,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      createdAt: user.created_at
    };
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token expired'
      });
    }
    
    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

/**
 * Middleware to authorize users based on roles
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not authenticated'
        });
      }
      
      const userRole = req.user.role;
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      
      if (!roles.includes(userRole)) {
        logger.warn(`Access denied for user ${req.user.id} with role ${userRole}. Required roles: ${roles.join(', ')}`);
        return res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions',
          requiredRoles: roles,
          userRole: userRole
        });
      }
      
      next();
      
    } catch (error) {
      logger.error('Authorization error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Authorization failed'
      });
    }
  };
};

/**
 * Middleware to authorize users based on specific permissions
 * @param {string|string[]} requiredPermissions - Single permission or array of required permissions
 */
const authorizePermissions = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not authenticated'
        });
      }
      
      const userPermissions = req.user.permissions || [];
      const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      
      // Admin role has all permissions
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasAllPermissions) {
        logger.warn(`Permission denied for user ${req.user.id}. Required: ${permissions.join(', ')}, User has: ${userPermissions.join(', ')}`);
        return res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions',
          requiredPermissions: permissions,
          userPermissions: userPermissions
        });
      }
      
      next();
      
    } catch (error) {
      logger.error('Permission authorization error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Middleware to check if user owns the resource or has admin privileges
 * @param {string} resourceIdParam - The parameter name containing the resource ID
 * @param {string} resourceTable - The database table to check ownership
 * @param {string} ownerColumn - The column name that contains the owner ID (default: 'user_id')
 */
const authorizeOwnership = (resourceIdParam, resourceTable, ownerColumn = 'user_id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not authenticated'
        });
      }
      
      // Admin can access all resources
      if (req.user.role === 'admin') {
        return next();
      }
      
      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        return res.status(400).json({
          error: 'Bad request',
          message: `Missing ${resourceIdParam} parameter`
        });
      }
      
      // Check ownership in database
      const connection = await createConnection(true);
      const [rows] = await connection.execute(
        `SELECT ${ownerColumn} FROM ${resourceTable} WHERE id = ?`,
        [resourceId]
      );
      
      await connection.end();
      
      if (rows.length === 0) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Resource not found'
        });
      }
      
      const ownerId = rows[0][ownerColumn];
      
      if (ownerId !== req.user.id) {
        logger.warn(`Ownership denied for user ${req.user.id} accessing resource ${resourceId} owned by ${ownerId}`);
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only access your own resources'
        });
      }
      
      next();
      
    } catch (error) {
      logger.error('Ownership authorization error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Ownership check failed'
      });
    }
  };
};

/**
 * Middleware for optional authentication
 * Similar to authenticateToken but doesn't fail if no token is provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    // Use the same logic as authenticateToken
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const connection = await createConnection(true);
    const [users] = await connection.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.email_verified, 
              u.is_active, u.created_at, r.name as role_name, r.permissions
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ? AND u.is_active = true`,
      [decoded.userId]
    );
    
    await connection.end();
    
    if (users.length === 0) {
      req.user = null;
      return next();
    }
    
    const user = users[0];
    let permissions = [];
    
    if (user.permissions) {
      try {
        permissions = JSON.parse(user.permissions);
      } catch (error) {
        logger.warn(`Failed to parse permissions for user ${user.id}:`, error.message);
      }
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role_name,
      permissions: permissions,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      createdAt: user.created_at
    };
    
    next();
    
  } catch (error) {
    // If token is invalid, just set user to null and continue
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizePermissions,
  authorizeOwnership,
  optionalAuth
};