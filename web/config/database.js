const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.pool = null;
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'signinsoft_db',
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      charset: 'utf8mb4',
      timezone: '+00:00'
    };
  }

  async connect() {
    try {
      this.pool = mysql.createPool(this.config);
      
      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      logger.logDatabase('Database connection pool created successfully', {
        host: this.config.host,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit
      });
      
      return this.pool;
    } catch (error) {
      logger.logDatabase('Failed to create database connection pool', { error: error.message });
      throw error;
    }
  }

  async query(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const startTime = Date.now();
    try {
      const [rows, fields] = await this.pool.execute(sql, params);
      const duration = Date.now() - startTime;
      
      logger.logDatabase('Query executed successfully', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rowCount: Array.isArray(rows) ? rows.length : 'N/A'
      });
      
      return rows;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logDatabase('Query execution failed', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        error: error.message
      });
      throw error;
    }
  }

  async transaction(callback) {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const connection = await this.pool.getConnection();
    await connection.beginTransaction();

    try {
      const result = await callback(connection);
      await connection.commit();
      connection.release();
      
      logger.logDatabase('Transaction completed successfully');
      return result;
    } catch (error) {
      await connection.rollback();
      connection.release();
      
      logger.logDatabase('Transaction rolled back', { error: error.message });
      throw error;
    }
  }

  async getConnection() {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return await this.pool.getConnection();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.logDatabase('Database connection pool closed');
    }
  }

  // Helper methods for common operations
  async findById(table, id, columns = '*') {
    const sql = `SELECT ${columns} FROM ${table} WHERE id = ? LIMIT 1`;
    const rows = await this.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findOne(table, conditions = {}, columns = '*') {
    const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
    const values = Object.values(conditions);
    
    const sql = `SELECT ${columns} FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''} LIMIT 1`;
    const rows = await this.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async findMany(table, conditions = {}, options = {}) {
    const { columns = '*', orderBy, limit, offset } = options;
    const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
    const values = Object.values(conditions);
    
    let sql = `SELECT ${columns} FROM ${table}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    if (limit) sql += ` LIMIT ${limit}`;
    if (offset) sql += ` OFFSET ${offset}`;
    
    return await this.query(sql, values);
  }

  async insert(table, data) {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const result = await this.query(sql, values);
    return result.insertId;
  }

  async update(table, data, conditions) {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
    const values = [...Object.values(data), ...Object.values(conditions)];
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const result = await this.query(sql, values);
    return result.affectedRows;
  }

  async delete(table, conditions) {
    const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
    const values = Object.values(conditions);
    
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const result = await this.query(sql, values);
    return result.affectedRows;
  }

  async count(table, conditions = {}) {
    const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
    const values = Object.values(conditions);
    
    const sql = `SELECT COUNT(*) as count FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
    const rows = await this.query(sql, values);
    return rows[0].count;
  }

  async exists(table, conditions) {
    const count = await this.count(table, conditions);
    return count > 0;
  }
}

// Create singleton instance
const database = new Database();

module.exports = database;