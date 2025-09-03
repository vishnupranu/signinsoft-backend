/**
 * Request Validation Middleware
 * 
 * Provides validation for API requests using Joi schemas
 * to ensure data integrity and security.
 */

const Joi = require('joi');
const { logger } = require('../utils/logger');

/**
 * Generic validation middleware
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });
    
    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      logger.warn('Validation error:', {
        property,
        errors: errorDetails,
        originalData: req[property]
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'The request data is invalid',
        details: errorDetails
      });
    }
    
    // Replace the original data with the validated and sanitized data
    req[property] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // User registration schema
  userRegistration: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]')).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
    firstName: Joi.string().min(2).max(50).required().messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name cannot exceed 50 characters',
      'any.required': 'First name is required'
    }),
    lastName: Joi.string().min(2).max(50).required().messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name cannot exceed 50 characters',
      'any.required': 'Last name is required'
    }),
    phone: Joi.string().pattern(new RegExp('^[+]?[1-9]\d{1,14}$')).optional().messages({
      'string.pattern.base': 'Please provide a valid phone number'
    }),
    role: Joi.string().valid('admin', 'hr', 'candidate').default('candidate')
  }),
  
  // User login schema
  userLogin: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    }),
    rememberMe: Joi.boolean().default(false)
  }),
  
  // Password reset request schema
  passwordResetRequest: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
  }),
  
  // Password reset schema
  passwordReset: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required'
    }),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]')).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    })
  }),
  
  // User profile update schema
  userProfileUpdate: Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(new RegExp('^[+]?[1-9]\d{1,14}$')).optional().allow(''),
    bio: Joi.string().max(500).optional().allow(''),
    location: Joi.string().max(100).optional().allow(''),
    website: Joi.string().uri().optional().allow(''),
    linkedinUrl: Joi.string().uri().optional().allow(''),
    githubUrl: Joi.string().uri().optional().allow('')
  }),
  
  // Job posting schema
  jobPosting: Joi.object({
    title: Joi.string().min(5).max(100).required().messages({
      'string.min': 'Job title must be at least 5 characters long',
      'string.max': 'Job title cannot exceed 100 characters',
      'any.required': 'Job title is required'
    }),
    description: Joi.string().min(50).max(5000).required().messages({
      'string.min': 'Job description must be at least 50 characters long',
      'string.max': 'Job description cannot exceed 5000 characters',
      'any.required': 'Job description is required'
    }),
    requirements: Joi.string().min(20).max(2000).required().messages({
      'string.min': 'Job requirements must be at least 20 characters long',
      'string.max': 'Job requirements cannot exceed 2000 characters',
      'any.required': 'Job requirements are required'
    }),
    employmentType: Joi.string().valid('full-time', 'part-time', 'contract', 'internship', 'freelance').required(),
    experienceLevel: Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'executive').required(),
    location: Joi.string().min(2).max(100).required(),
    salaryMin: Joi.number().integer().min(0).optional(),
    salaryMax: Joi.number().integer().min(0).optional(),
    categoryId: Joi.number().integer().positive().required(),
    departmentId: Joi.number().integer().positive().optional(),
    skills: Joi.array().items(Joi.string().min(2).max(50)).max(20).optional(),
    benefits: Joi.array().items(Joi.string().min(2).max(100)).max(10).optional()
  }),
  
  // Job application schema
  jobApplication: Joi.object({
    jobId: Joi.number().integer().positive().required(),
    coverLetter: Joi.string().min(50).max(2000).required().messages({
      'string.min': 'Cover letter must be at least 50 characters long',
      'string.max': 'Cover letter cannot exceed 2000 characters',
      'any.required': 'Cover letter is required'
    }),
    expectedSalary: Joi.number().integer().min(0).optional(),
    availableStartDate: Joi.date().min('now').optional(),
    portfolioUrl: Joi.string().uri().optional().allow(''),
    additionalInfo: Joi.string().max(1000).optional().allow('')
  }),
  
  // Company schema
  company: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().min(10).max(1000).optional().allow(''),
    website: Joi.string().uri().optional().allow(''),
    industry: Joi.string().min(2).max(50).optional().allow(''),
    sizeRange: Joi.string().valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+').optional(),
    location: Joi.string().min(2).max(100).optional().allow(''),
    foundedYear: Joi.number().integer().min(1800).max(new Date().getFullYear()).optional()
  }),
  
  // Content schema
  content: Joi.object({
    title: Joi.string().min(5).max(200).required(),
    slug: Joi.string().min(5).max(200).pattern(new RegExp('^[a-z0-9-]+$')).optional(),
    content: Joi.string().min(10).max(50000).required(),
    excerpt: Joi.string().max(500).optional().allow(''),
    categoryId: Joi.number().integer().positive().required(),
    status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
    tags: Joi.array().items(Joi.string().min(2).max(30)).max(10).optional(),
    featuredImage: Joi.string().uri().optional().allow(''),
    seoTitle: Joi.string().max(60).optional().allow(''),
    seoDescription: Joi.string().max(160).optional().allow(''),
    publishedAt: Joi.date().optional()
  }),
  
  // Project schema
  project: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().min(10).max(1000).optional().allow(''),
    status: Joi.string().valid('planning', 'active', 'on-hold', 'completed', 'cancelled').default('planning'),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    startDate: Joi.date().optional(),
    endDate: Joi.date().min(Joi.ref('startDate')).optional(),
    budget: Joi.number().min(0).optional(),
    clientId: Joi.number().integer().positive().optional(),
    teamMembers: Joi.array().items(Joi.number().integer().positive()).max(50).optional()
  }),
  
  // Calendar event schema
  calendarEvent: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(1000).optional().allow(''),
    startTime: Joi.date().required(),
    endTime: Joi.date().min(Joi.ref('startTime')).required(),
    location: Joi.string().max(200).optional().allow(''),
    type: Joi.string().valid('meeting', 'interview', 'deadline', 'reminder', 'other').default('meeting'),
    priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
    attendees: Joi.array().items(Joi.string().email()).max(50).optional(),
    isRecurring: Joi.boolean().default(false),
    recurrencePattern: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').optional(),
    reminderMinutes: Joi.number().integer().min(0).max(10080).optional() // Max 1 week
  }),
  
  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(100).optional().allow(''),
    filter: Joi.object().optional()
  }),
  
  // ID parameter schema
  idParam: Joi.object({
    id: Joi.number().integer().positive().required().messages({
      'number.base': 'ID must be a number',
      'number.integer': 'ID must be an integer',
      'number.positive': 'ID must be positive',
      'any.required': 'ID is required'
    })
  })
};

// Convenience functions for common validations
const validateBody = (schema) => validateRequest(schema, 'body');
const validateQuery = (schema) => validateRequest(schema, 'query');
const validateParams = (schema) => validateRequest(schema, 'params');

// Pre-built validation middleware
const validations = {
  // Authentication validations
  validateRegistration: validateBody(schemas.userRegistration),
  validateLogin: validateBody(schemas.userLogin),
  validatePasswordResetRequest: validateBody(schemas.passwordResetRequest),
  validatePasswordReset: validateBody(schemas.passwordReset),
  
  // User validations
  validateProfileUpdate: validateBody(schemas.userProfileUpdate),
  
  // Job validations
  validateJobPosting: validateBody(schemas.jobPosting),
  validateJobApplication: validateBody(schemas.jobApplication),
  
  // Company validations
  validateCompany: validateBody(schemas.company),
  
  // Content validations
  validateContent: validateBody(schemas.content),
  
  // Project validations
  validateProject: validateBody(schemas.project),
  
  // Calendar validations
  validateCalendarEvent: validateBody(schemas.calendarEvent),
  
  // Common validations
  validatePagination: validateQuery(schemas.pagination),
  validateIdParam: validateParams(schemas.idParam)
};

module.exports = {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  schemas,
  validations
};