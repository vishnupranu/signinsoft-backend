const database = require('../config/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class Job {
  static async create(jobData) {
    const {
      title,
      description,
      requirements,
      companyId,
      categoryId,
      location,
      jobType,
      salaryMin,
      salaryMax,
      experienceLevel,
      skills,
      benefits,
      applicationDeadline,
      isRemote,
      createdBy
    } = jobData;
    
    const jobDataFinal = {
      title,
      description,
      requirements,
      company_id: companyId,
      category_id: categoryId,
      location,
      job_type: jobType,
      salary_min: salaryMin,
      salary_max: salaryMax,
      experience_level: experienceLevel,
      benefits,
      application_deadline: applicationDeadline,
      is_remote: isRemote || false,
      status: 'active',
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    try {
      const jobId = await database.insert('jobs', jobDataFinal);
      
      // Add skills if provided
      if (skills && skills.length > 0) {
        await this.addJobSkills(jobId, skills);
      }
      
      logger.logBusiness('Job created successfully', { jobId, title, companyId });
      
      return await this.findById(jobId);
    } catch (error) {
      logger.logBusiness('Failed to create job', { title, error: error.message });
      throw error;
    }
  }
  
  static async findById(id) {
    const sql = `
      SELECT j.*, c.name as company_name, c.logo as company_logo,
             jc.name as category_name,
             u.first_name as creator_first_name, u.last_name as creator_last_name,
             COUNT(ja.id) as application_count
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN job_categories jc ON j.category_id = jc.id
      LEFT JOIN users u ON j.created_by = u.id
      LEFT JOIN job_applications ja ON j.id = ja.job_id
      WHERE j.id = ?
      GROUP BY j.id
    `;
    
    const jobs = await database.query(sql, [id]);
    if (jobs.length === 0) {
      throw new NotFoundError('Job not found');
    }
    
    const job = jobs[0];
    
    // Get job skills
    const skills = await this.getJobSkills(id);
    
    return this.formatJob({ ...job, skills });
  }
  
  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 10,
      companyId,
      categoryId,
      location,
      jobType,
      experienceLevel,
      isRemote,
      salaryMin,
      salaryMax,
      search,
      status = 'active',
      skills,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;
    
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT j.*, c.name as company_name, c.logo as company_logo,
             jc.name as category_name,
             COUNT(ja.id) as application_count
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN job_categories jc ON j.category_id = jc.id
      LEFT JOIN job_applications ja ON j.id = ja.job_id
    `;
    
    const whereConditions = [];
    const values = [];
    
    // Add filters
    if (companyId) {
      whereConditions.push('j.company_id = ?');
      values.push(companyId);
    }
    
    if (categoryId) {
      whereConditions.push('j.category_id = ?');
      values.push(categoryId);
    }
    
    if (location) {
      whereConditions.push('j.location LIKE ?');
      values.push(`%${location}%`);
    }
    
    if (jobType) {
      whereConditions.push('j.job_type = ?');
      values.push(jobType);
    }
    
    if (experienceLevel) {
      whereConditions.push('j.experience_level = ?');
      values.push(experienceLevel);
    }
    
    if (isRemote !== undefined) {
      whereConditions.push('j.is_remote = ?');
      values.push(isRemote);
    }
    
    if (salaryMin) {
      whereConditions.push('j.salary_max >= ?');
      values.push(salaryMin);
    }
    
    if (salaryMax) {
      whereConditions.push('j.salary_min <= ?');
      values.push(salaryMax);
    }
    
    if (status) {
      whereConditions.push('j.status = ?');
      values.push(status);
    }
    
    if (search) {
      whereConditions.push('(j.title LIKE ? OR j.description LIKE ? OR c.name LIKE ?)');
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Skills filter
    if (skills && skills.length > 0) {
      const skillPlaceholders = skills.map(() => '?').join(',');
      sql += ` INNER JOIN job_skills js ON j.id = js.job_id
               INNER JOIN skills s ON js.skill_id = s.id`;
      whereConditions.push(`s.name IN (${skillPlaceholders})`);
      values.push(...skills);
    }
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    sql += ` GROUP BY j.id`;
    
    // Add sorting
    const validSortColumns = ['created_at', 'title', 'salary_min', 'salary_max', 'application_deadline'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY j.${sortColumn} ${order}`;
    
    sql += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const jobs = await database.query(sql, values);
    
    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT j.id) as total
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN job_categories jc ON j.category_id = jc.id
    `;
    
    if (skills && skills.length > 0) {
      countSql += ` INNER JOIN job_skills js ON j.id = js.job_id
                    INNER JOIN skills s ON js.skill_id = s.id`;
    }
    
    const countValues = values.slice(0, -2); // Remove limit and offset
    
    if (whereConditions.length > 0) {
      countSql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    const [{ total }] = await database.query(countSql, countValues);
    
    // Get skills for each job
    const jobsWithSkills = await Promise.all(
      jobs.map(async (job) => {
        const skills = await this.getJobSkills(job.id);
        return this.formatJob({ ...job, skills });
      })
    );
    
    return {
      jobs: jobsWithSkills,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  static async update(id, updateData) {
    const job = await this.findById(id);
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    
    const {
      title,
      description,
      requirements,
      categoryId,
      location,
      jobType,
      salaryMin,
      salaryMax,
      experienceLevel,
      skills,
      benefits,
      applicationDeadline,
      isRemote,
      status
    } = updateData;
    
    const updateFields = {
      updated_at: new Date()
    };
    
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (requirements !== undefined) updateFields.requirements = requirements;
    if (categoryId !== undefined) updateFields.category_id = categoryId;
    if (location !== undefined) updateFields.location = location;
    if (jobType !== undefined) updateFields.job_type = jobType;
    if (salaryMin !== undefined) updateFields.salary_min = salaryMin;
    if (salaryMax !== undefined) updateFields.salary_max = salaryMax;
    if (experienceLevel !== undefined) updateFields.experience_level = experienceLevel;
    if (benefits !== undefined) updateFields.benefits = benefits;
    if (applicationDeadline !== undefined) updateFields.application_deadline = applicationDeadline;
    if (isRemote !== undefined) updateFields.is_remote = isRemote;
    if (status !== undefined) updateFields.status = status;
    
    try {
      await database.update('jobs', updateFields, { id });
      
      // Update skills if provided
      if (skills !== undefined) {
        await this.updateJobSkills(id, skills);
      }
      
      logger.logBusiness('Job updated successfully', { jobId: id });
      
      return await this.findById(id);
    } catch (error) {
      logger.logBusiness('Failed to update job', { jobId: id, error: error.message });
      throw error;
    }
  }
  
  static async delete(id) {
    const job = await this.findById(id);
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    
    try {
      // Delete related records first
      await database.delete('job_skills', { job_id: id });
      await database.delete('job_applications', { job_id: id });
      await database.delete('jobs', { id });
      
      logger.logBusiness('Job deleted', { jobId: id, title: job.title });
      return true;
    } catch (error) {
      logger.logBusiness('Failed to delete job', { jobId: id, error: error.message });
      throw error;
    }
  }
  
  static async getJobSkills(jobId) {
    const sql = `
      SELECT s.id, s.name, s.category
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      WHERE js.job_id = ?
      ORDER BY s.name
    `;
    
    return await database.query(sql, [jobId]);
  }
  
  static async addJobSkills(jobId, skills) {
    if (!skills || skills.length === 0) return;
    
    try {
      for (const skillName of skills) {
        // Find or create skill
        let skill = await database.findOne('skills', { name: skillName });
        if (!skill) {
          const skillId = await database.insert('skills', {
            name: skillName,
            category: 'general',
            created_at: new Date()
          });
          skill = { id: skillId };
        }
        
        // Add job-skill relationship
        const exists = await database.exists('job_skills', {
          job_id: jobId,
          skill_id: skill.id
        });
        
        if (!exists) {
          await database.insert('job_skills', {
            job_id: jobId,
            skill_id: skill.id,
            created_at: new Date()
          });
        }
      }
    } catch (error) {
      logger.logBusiness('Failed to add job skills', { jobId, error: error.message });
      throw error;
    }
  }
  
  static async updateJobSkills(jobId, skills) {
    try {
      // Remove existing skills
      await database.delete('job_skills', { job_id: jobId });
      
      // Add new skills
      await this.addJobSkills(jobId, skills);
    } catch (error) {
      logger.logBusiness('Failed to update job skills', { jobId, error: error.message });
      throw error;
    }
  }
  
  static async getJobStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_jobs,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_jobs,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_jobs,
        COUNT(CASE WHEN is_remote = 1 THEN 1 END) as remote_jobs,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_jobs_30_days,
        AVG(salary_min) as avg_salary_min,
        AVG(salary_max) as avg_salary_max
      FROM jobs
    `;
    
    const [stats] = await database.query(sql);
    return stats;
  }
  
  static async getPopularSkills(limit = 10) {
    const sql = `
      SELECT s.name, s.category, COUNT(js.job_id) as job_count
      FROM skills s
      JOIN job_skills js ON s.id = js.skill_id
      JOIN jobs j ON js.job_id = j.id
      WHERE j.status = 'active'
      GROUP BY s.id, s.name, s.category
      ORDER BY job_count DESC
      LIMIT ?
    `;
    
    return await database.query(sql, [limit]);
  }
  
  static async getJobsByCompany(companyId, options = {}) {
    return await this.findAll({ ...options, companyId });
  }
  
  static async searchJobs(searchTerm, options = {}) {
    return await this.findAll({ ...options, search: searchTerm });
  }
  
  static formatJob(job) {
    if (!job) return null;
    
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      companyId: job.company_id,
      companyName: job.company_name,
      companyLogo: job.company_logo,
      categoryId: job.category_id,
      categoryName: job.category_name,
      location: job.location,
      jobType: job.job_type,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      experienceLevel: job.experience_level,
      skills: job.skills || [],
      benefits: job.benefits,
      applicationDeadline: job.application_deadline,
      isRemote: job.is_remote,
      status: job.status,
      applicationCount: job.application_count || 0,
      createdBy: job.created_by,
      creatorName: job.creator_first_name && job.creator_last_name 
        ? `${job.creator_first_name} ${job.creator_last_name}` 
        : null,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    };
  }
}

module.exports = Job;