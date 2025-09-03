const bcrypt = require('bcryptjs');
const database = require('../config/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class User {
  static async create(userData) {
    const { email, password, firstName, lastName, role = 'candidate', phone, companyId } = userData;
    
    // Check if user already exists
    const existingUser = await database.findOne('users', { email });
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }
    
    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const userData_final = {
      email,
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      role,
      phone,
      company_id: companyId,
      email_verified: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    try {
      const userId = await database.insert('users', userData_final);
      logger.logAuth('User created successfully', { userId, email, role });
      
      // Return user without password
      const newUser = await this.findById(userId);
      return newUser;
    } catch (error) {
      logger.logAuth('Failed to create user', { email, error: error.message });
      throw error;
    }
  }
  
  static async findById(id) {
    const user = await database.findById('users', id, 
      'id, email, first_name, last_name, role, phone, company_id, email_verified, is_active, profile_picture, last_login, created_at, updated_at'
    );
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    return this.formatUser(user);
  }
  
  static async findByEmail(email) {
    const user = await database.findOne('users', { email }, 
      'id, email, password, first_name, last_name, role, phone, company_id, email_verified, is_active, profile_picture, last_login, created_at, updated_at'
    );
    
    return user ? this.formatUser(user) : null;
  }
  
  static async findByEmailWithPassword(email) {
    const user = await database.findOne('users', { email });
    return user ? this.formatUser(user, true) : null;
  }
  
  static async findAll(options = {}) {
    const { page = 1, limit = 10, role, companyId, search, isActive } = options;
    const offset = (page - 1) * limit;
    
    let conditions = {};
    if (role) conditions.role = role;
    if (companyId) conditions.company_id = companyId;
    if (isActive !== undefined) conditions.is_active = isActive;
    
    let sql = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.phone, 
             u.company_id, u.email_verified, u.is_active, u.profile_picture, 
             u.last_login, u.created_at, u.updated_at,
             c.name as company_name
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
    `;
    
    const whereConditions = [];
    const values = [];
    
    Object.keys(conditions).forEach(key => {
      whereConditions.push(`u.${key} = ?`);
      values.push(conditions[key]);
    });
    
    if (search) {
      whereConditions.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`);
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const users = await database.query(sql, values);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM users u';
    const countValues = values.slice(0, -2); // Remove limit and offset
    
    if (whereConditions.length > 0) {
      countSql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    const [{ total }] = await database.query(countSql, countValues);
    
    return {
      users: users.map(user => this.formatUser(user)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  static async update(id, updateData) {
    const { firstName, lastName, phone, profilePicture, companyId } = updateData;
    
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    const updateFields = {
      updated_at: new Date()
    };
    
    if (firstName !== undefined) updateFields.first_name = firstName;
    if (lastName !== undefined) updateFields.last_name = lastName;
    if (phone !== undefined) updateFields.phone = phone;
    if (profilePicture !== undefined) updateFields.profile_picture = profilePicture;
    if (companyId !== undefined) updateFields.company_id = companyId;
    
    try {
      await database.update('users', updateFields, { id });
      logger.logAuth('User updated successfully', { userId: id });
      
      return await this.findById(id);
    } catch (error) {
      logger.logAuth('Failed to update user', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async updatePassword(id, currentPassword, newPassword) {
    const user = await database.findById('users', id, 'id, password');
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new ValidationError('Current password is incorrect');
    }
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    try {
      await database.update('users', 
        { password: hashedPassword, updated_at: new Date() }, 
        { id }
      );
      
      logger.logAuth('Password updated successfully', { userId: id });
      return true;
    } catch (error) {
      logger.logAuth('Failed to update password', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async resetPassword(email, newPassword) {
    const user = await database.findOne('users', { email }, 'id');
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    try {
      await database.update('users', 
        { password: hashedPassword, updated_at: new Date() }, 
        { id: user.id }
      );
      
      logger.logAuth('Password reset successfully', { userId: user.id, email });
      return true;
    } catch (error) {
      logger.logAuth('Failed to reset password', { userId: user.id, error: error.message });
      throw error;
    }
  }
  
  static async verifyEmail(id) {
    try {
      await database.update('users', 
        { email_verified: true, updated_at: new Date() }, 
        { id }
      );
      
      logger.logAuth('Email verified successfully', { userId: id });
      return true;
    } catch (error) {
      logger.logAuth('Failed to verify email', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async updateLastLogin(id) {
    try {
      await database.update('users', 
        { last_login: new Date(), updated_at: new Date() }, 
        { id }
      );
      
      logger.logAuth('Last login updated', { userId: id });
    } catch (error) {
      logger.logAuth('Failed to update last login', { userId: id, error: error.message });
    }
  }
  
  static async deactivate(id) {
    try {
      await database.update('users', 
        { is_active: false, updated_at: new Date() }, 
        { id }
      );
      
      logger.logAuth('User deactivated', { userId: id });
      return true;
    } catch (error) {
      logger.logAuth('Failed to deactivate user', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async activate(id) {
    try {
      await database.update('users', 
        { is_active: true, updated_at: new Date() }, 
        { id }
      );
      
      logger.logAuth('User activated', { userId: id });
      return true;
    } catch (error) {
      logger.logAuth('Failed to activate user', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async delete(id) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    try {
      await database.delete('users', { id });
      logger.logAuth('User deleted', { userId: id, email: user.email });
      return true;
    } catch (error) {
      logger.logAuth('Failed to delete user', { userId: id, error: error.message });
      throw error;
    }
  }
  
  static async validatePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
  
  static async getUserStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN role = 'hr' THEN 1 END) as hr_users,
        COUNT(CASE WHEN role = 'candidate' THEN 1 END) as candidate_users,
        COUNT(CASE WHEN email_verified = 1 THEN 1 END) as verified_users,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_30_days
      FROM users
    `;
    
    const [stats] = await database.query(sql);
    return stats;
  }
  
  static formatUser(user, includePassword = false) {
    if (!user) return null;
    
    const formatted = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      role: user.role,
      phone: user.phone,
      companyId: user.company_id,
      companyName: user.company_name,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      profilePicture: user.profile_picture,
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
    
    if (includePassword) {
      formatted.password = user.password;
    }
    
    return formatted;
  }
}

module.exports = User;