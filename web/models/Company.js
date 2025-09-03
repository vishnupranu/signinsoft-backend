const database = require('../config/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class Company {
  static async create(companyData) {
    const {
      name,
      description,
      website,
      industry,
      size,
      location,
      address,
      phone,
      email,
      logo,
      foundedYear,
      createdBy
    } = companyData;
    
    // Check if company with same name already exists
    const existingCompany = await database.findOne('companies', { name });
    if (existingCompany) {
      throw new ConflictError('Company with this name already exists');
    }
    
    const companyDataFinal = {
      name,
      description,
      website,
      industry,
      size,
      location,
      address,
      phone,
      email,
      logo,
      founded_year: foundedYear,
      is_active: true,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    try {
      const companyId = await database.insert('companies', companyDataFinal);
      
      logger.logBusiness('Company created successfully', {
        companyId,
        name,
        createdBy
      });
      
      return await this.findById(companyId);
    } catch (error) {
      logger.logBusiness('Failed to create company', {
        name,
        error: error.message
      });
      throw error;
    }
  }
  
  static async findById(id) {
    const sql = `
      SELECT c.*, 
             u.first_name as creator_first_name, u.last_name as creator_last_name,
             COUNT(DISTINCT j.id) as job_count,
             COUNT(DISTINCT emp.id) as employee_count
      FROM companies c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN jobs j ON c.id = j.company_id AND j.status = 'active'
      LEFT JOIN users emp ON c.id = emp.company_id AND emp.is_active = 1
      WHERE c.id = ?
      GROUP BY c.id
    `;
    
    const companies = await database.query(sql, [id]);
    if (companies.length === 0) {
      throw new NotFoundError('Company not found');
    }
    
    const company = companies[0];
    
    // Get departments
    const departments = await this.getCompanyDepartments(id);
    
    return this.formatCompany({ ...company, departments });
  }
  
  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 10,
      industry,
      size,
      location,
      search,
      isActive = true,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;
    
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT c.*, 
             u.first_name as creator_first_name, u.last_name as creator_last_name,
             COUNT(DISTINCT j.id) as job_count,
             COUNT(DISTINCT emp.id) as employee_count
      FROM companies c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN jobs j ON c.id = j.company_id AND j.status = 'active'
      LEFT JOIN users emp ON c.id = emp.company_id AND emp.is_active = 1
    `;
    
    const whereConditions = [];
    const values = [];
    
    if (industry) {
      whereConditions.push('c.industry = ?');
      values.push(industry);
    }
    
    if (size) {
      whereConditions.push('c.size = ?');
      values.push(size);
    }
    
    if (location) {
      whereConditions.push('c.location LIKE ?');
      values.push(`%${location}%`);
    }
    
    if (isActive !== undefined) {
      whereConditions.push('c.is_active = ?');
      values.push(isActive);
    }
    
    if (search) {
      whereConditions.push('(c.name LIKE ? OR c.description LIKE ? OR c.industry LIKE ?)');
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    sql += ` GROUP BY c.id`;
    
    // Add sorting
    const validSortColumns = ['created_at', 'name', 'industry', 'size', 'location'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY c.${sortColumn} ${order}`;
    
    sql += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const companies = await database.query(sql, values);
    
    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM companies c
      LEFT JOIN users u ON c.created_by = u.id
    `;
    
    const countValues = values.slice(0, -2); // Remove limit and offset
    
    if (whereConditions.length > 0) {
      countSql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    const [{ total }] = await database.query(countSql, countValues);
    
    return {
      companies: companies.map(company => this.formatCompany(company)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  static async update(id, updateData) {
    const company = await this.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    
    const {
      name,
      description,
      website,
      industry,
      size,
      location,
      address,
      phone,
      email,
      logo,
      foundedYear,
      isActive
    } = updateData;
    
    // Check if name is being changed and if it conflicts
    if (name && name !== company.name) {
      const existingCompany = await database.findOne('companies', { name });
      if (existingCompany && existingCompany.id !== id) {
        throw new ConflictError('Company with this name already exists');
      }
    }
    
    const updateFields = {
      updated_at: new Date()
    };
    
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (website !== undefined) updateFields.website = website;
    if (industry !== undefined) updateFields.industry = industry;
    if (size !== undefined) updateFields.size = size;
    if (location !== undefined) updateFields.location = location;
    if (address !== undefined) updateFields.address = address;
    if (phone !== undefined) updateFields.phone = phone;
    if (email !== undefined) updateFields.email = email;
    if (logo !== undefined) updateFields.logo = logo;
    if (foundedYear !== undefined) updateFields.founded_year = foundedYear;
    if (isActive !== undefined) updateFields.is_active = isActive;
    
    try {
      await database.update('companies', updateFields, { id });
      
      logger.logBusiness('Company updated successfully', { companyId: id });
      
      return await this.findById(id);
    } catch (error) {
      logger.logBusiness('Failed to update company', {
        companyId: id,
        error: error.message
      });
      throw error;
    }
  }
  
  static async delete(id) {
    const company = await this.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    
    // Check if company has active jobs or employees
    const activeJobs = await database.count('jobs', { company_id: id, status: 'active' });
    if (activeJobs > 0) {
      throw new ValidationError('Cannot delete company with active job postings');
    }
    
    const employees = await database.count('users', { company_id: id, is_active: true });
    if (employees > 0) {
      throw new ValidationError('Cannot delete company with active employees');
    }
    
    try {
      // Delete related records
      await database.delete('departments', { company_id: id });
      await database.delete('companies', { id });
      
      logger.logBusiness('Company deleted', {
        companyId: id,
        name: company.name
      });
      
      return true;
    } catch (error) {
      logger.logBusiness('Failed to delete company', {
        companyId: id,
        error: error.message
      });
      throw error;
    }
  }
  
  static async getCompanyDepartments(companyId) {
    const sql = `
      SELECT d.*, COUNT(u.id) as employee_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id AND u.is_active = 1
      WHERE d.company_id = ?
      GROUP BY d.id
      ORDER BY d.name
    `;
    
    const departments = await database.query(sql, [companyId]);
    
    return departments.map(dept => ({
      id: dept.id,
      name: dept.name,
      description: dept.description,
      employeeCount: dept.employee_count,
      createdAt: dept.created_at
    }));
  }
  
  static async addDepartment(companyId, departmentData) {
    const { name, description } = departmentData;
    
    // Check if department already exists in this company
    const existingDept = await database.findOne('departments', {
      company_id: companyId,
      name
    });
    
    if (existingDept) {
      throw new ConflictError('Department with this name already exists in the company');
    }
    
    const deptData = {
      company_id: companyId,
      name,
      description,
      created_at: new Date()
    };
    
    try {
      const deptId = await database.insert('departments', deptData);
      
      logger.logBusiness('Department created', {
        departmentId: deptId,
        companyId,
        name
      });
      
      return {
        id: deptId,
        name,
        description,
        companyId,
        employeeCount: 0,
        createdAt: new Date()
      };
    } catch (error) {
      logger.logBusiness('Failed to create department', {
        companyId,
        name,
        error: error.message
      });
      throw error;
    }
  }
  
  static async updateDepartment(companyId, departmentId, updateData) {
    const { name, description } = updateData;
    
    // Verify department belongs to company
    const department = await database.findOne('departments', {
      id: departmentId,
      company_id: companyId
    });
    
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    
    // Check for name conflicts
    if (name && name !== department.name) {
      const existingDept = await database.findOne('departments', {
        company_id: companyId,
        name
      });
      
      if (existingDept && existingDept.id !== departmentId) {
        throw new ConflictError('Department with this name already exists in the company');
      }
    }
    
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    
    try {
      await database.update('departments', updateFields, { id: departmentId });
      
      logger.logBusiness('Department updated', {
        departmentId,
        companyId
      });
      
      return true;
    } catch (error) {
      logger.logBusiness('Failed to update department', {
        departmentId,
        companyId,
        error: error.message
      });
      throw error;
    }
  }
  
  static async deleteDepartment(companyId, departmentId) {
    // Verify department belongs to company
    const department = await database.findOne('departments', {
      id: departmentId,
      company_id: companyId
    });
    
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    
    // Check if department has employees
    const employeeCount = await database.count('users', {
      department_id: departmentId,
      is_active: true
    });
    
    if (employeeCount > 0) {
      throw new ValidationError('Cannot delete department with active employees');
    }
    
    try {
      await database.delete('departments', { id: departmentId });
      
      logger.logBusiness('Department deleted', {
        departmentId,
        companyId,
        name: department.name
      });
      
      return true;
    } catch (error) {
      logger.logBusiness('Failed to delete department', {
        departmentId,
        companyId,
        error: error.message
      });
      throw error;
    }
  }
  
  static async getCompanyStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_companies,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_companies,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_companies_30_days,
        COUNT(CASE WHEN size = 'startup' THEN 1 END) as startup_companies,
        COUNT(CASE WHEN size = 'small' THEN 1 END) as small_companies,
        COUNT(CASE WHEN size = 'medium' THEN 1 END) as medium_companies,
        COUNT(CASE WHEN size = 'large' THEN 1 END) as large_companies,
        COUNT(CASE WHEN size = 'enterprise' THEN 1 END) as enterprise_companies
      FROM companies
    `;
    
    const [stats] = await database.query(sql);
    return stats;
  }
  
  static async getIndustryStats() {
    const sql = `
      SELECT industry, COUNT(*) as company_count
      FROM companies
      WHERE is_active = 1 AND industry IS NOT NULL
      GROUP BY industry
      ORDER BY company_count DESC
      LIMIT 10
    `;
    
    return await database.query(sql);
  }
  
  static async searchCompanies(searchTerm, options = {}) {
    return await this.findAll({ ...options, search: searchTerm });
  }
  
  static formatCompany(company) {
    if (!company) return null;
    
    return {
      id: company.id,
      name: company.name,
      description: company.description,
      website: company.website,
      industry: company.industry,
      size: company.size,
      location: company.location,
      address: company.address,
      phone: company.phone,
      email: company.email,
      logo: company.logo,
      foundedYear: company.founded_year,
      isActive: company.is_active,
      jobCount: company.job_count || 0,
      employeeCount: company.employee_count || 0,
      departments: company.departments || [],
      createdBy: company.created_by,
      creatorName: company.creator_first_name && company.creator_last_name 
        ? `${company.creator_first_name} ${company.creator_last_name}` 
        : null,
      createdAt: company.created_at,
      updatedAt: company.updated_at
    };
  }
}

module.exports = Company;