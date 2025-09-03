const database = require('../config/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class Application {
  static async create(applicationData) {
    const {
      jobId,
      candidateId,
      coverLetter,
      resumeUrl,
      portfolioUrl,
      expectedSalary,
      availabilityDate,
      additionalInfo
    } = applicationData;
    
    // Check if application already exists
    const existingApplication = await database.findOne('job_applications', {
      job_id: jobId,
      candidate_id: candidateId
    });
    
    if (existingApplication) {
      throw new ConflictError('You have already applied for this job');
    }
    
    // Verify job exists and is active
    const job = await database.findOne('jobs', { id: jobId, status: 'active' });
    if (!job) {
      throw new NotFoundError('Job not found or no longer active');
    }
    
    // Check application deadline
    if (job.application_deadline && new Date() > new Date(job.application_deadline)) {
      throw new ValidationError('Application deadline has passed');
    }
    
    const applicationDataFinal = {
      job_id: jobId,
      candidate_id: candidateId,
      cover_letter: coverLetter,
      resume_url: resumeUrl,
      portfolio_url: portfolioUrl,
      expected_salary: expectedSalary,
      availability_date: availabilityDate,
      additional_info: additionalInfo,
      status: 'pending',
      applied_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };
    
    try {
      const applicationId = await database.insert('job_applications', applicationDataFinal);
      
      // Create status history entry
      await this.addStatusHistory(applicationId, 'pending', 'Application submitted', candidateId);
      
      logger.logBusiness('Application created successfully', {
        applicationId,
        jobId,
        candidateId
      });
      
      return await this.findById(applicationId);
    } catch (error) {
      logger.logBusiness('Failed to create application', {
        jobId,
        candidateId,
        error: error.message
      });
      throw error;
    }
  }
  
  static async findById(id) {
    const sql = `
      SELECT ja.*, 
             j.title as job_title, j.company_id, j.location as job_location,
             j.job_type, j.salary_min, j.salary_max,
             c.name as company_name, c.logo as company_logo,
             u.first_name as candidate_first_name, u.last_name as candidate_last_name,
             u.email as candidate_email, u.phone as candidate_phone,
             u.profile_picture as candidate_profile_picture
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.candidate_id = u.id
      WHERE ja.id = ?
    `;
    
    const applications = await database.query(sql, [id]);
    if (applications.length === 0) {
      throw new NotFoundError('Application not found');
    }
    
    const application = applications[0];
    
    // Get status history
    const statusHistory = await this.getStatusHistory(id);
    
    return this.formatApplication({ ...application, statusHistory });
  }
  
  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 10,
      jobId,
      candidateId,
      companyId,
      status,
      dateFrom,
      dateTo,
      search,
      sortBy = 'applied_at',
      sortOrder = 'DESC'
    } = options;
    
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT ja.*, 
             j.title as job_title, j.company_id, j.location as job_location,
             j.job_type, j.salary_min, j.salary_max,
             c.name as company_name, c.logo as company_logo,
             u.first_name as candidate_first_name, u.last_name as candidate_last_name,
             u.email as candidate_email, u.phone as candidate_phone,
             u.profile_picture as candidate_profile_picture
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.candidate_id = u.id
    `;
    
    const whereConditions = [];
    const values = [];
    
    if (jobId) {
      whereConditions.push('ja.job_id = ?');
      values.push(jobId);
    }
    
    if (candidateId) {
      whereConditions.push('ja.candidate_id = ?');
      values.push(candidateId);
    }
    
    if (companyId) {
      whereConditions.push('j.company_id = ?');
      values.push(companyId);
    }
    
    if (status) {
      whereConditions.push('ja.status = ?');
      values.push(status);
    }
    
    if (dateFrom) {
      whereConditions.push('ja.applied_at >= ?');
      values.push(dateFrom);
    }
    
    if (dateTo) {
      whereConditions.push('ja.applied_at <= ?');
      values.push(dateTo);
    }
    
    if (search) {
      whereConditions.push(`(
        j.title LIKE ? OR 
        c.name LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    // Add sorting
    const validSortColumns = ['applied_at', 'status', 'job_title', 'candidate_first_name', 'expected_salary'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'applied_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    if (sortBy === 'job_title') {
      sql += ` ORDER BY j.title ${order}`;
    } else if (sortBy === 'candidate_first_name') {
      sql += ` ORDER BY u.first_name ${order}, u.last_name ${order}`;
    } else {
      sql += ` ORDER BY ja.${sortColumn} ${order}`;
    }
    
    sql += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const applications = await database.query(sql, values);
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.candidate_id = u.id
    `;
    
    const countValues = values.slice(0, -2); // Remove limit and offset
    
    if (whereConditions.length > 0) {
      countSql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    const [{ total }] = await database.query(countSql, countValues);
    
    return {
      applications: applications.map(app => this.formatApplication(app)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  static async updateStatus(id, newStatus, notes = '', updatedBy) {
    const validStatuses = ['pending', 'reviewing', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'hired', 'rejected', 'withdrawn'];
    
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError('Invalid application status');
    }
    
    const application = await this.findById(id);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    
    if (application.status === newStatus) {
      throw new ValidationError('Application is already in this status');
    }
    
    try {
      await database.update('job_applications', 
        { 
          status: newStatus, 
          updated_at: new Date() 
        }, 
        { id }
      );
      
      // Add status history entry
      await this.addStatusHistory(id, newStatus, notes, updatedBy);
      
      logger.logBusiness('Application status updated', {
        applicationId: id,
        oldStatus: application.status,
        newStatus,
        updatedBy
      });
      
      return await this.findById(id);
    } catch (error) {
      logger.logBusiness('Failed to update application status', {
        applicationId: id,
        error: error.message
      });
      throw error;
    }
  }
  
  static async addStatusHistory(applicationId, status, notes, updatedBy) {
    const historyData = {
      application_id: applicationId,
      status,
      notes,
      updated_by: updatedBy,
      created_at: new Date()
    };
    
    try {
      await database.insert('application_status_history', historyData);
    } catch (error) {
      logger.logBusiness('Failed to add status history', {
        applicationId,
        error: error.message
      });
      // Don't throw error as this is not critical
    }
  }
  
  static async getStatusHistory(applicationId) {
    const sql = `
      SELECT ash.*, u.first_name, u.last_name
      FROM application_status_history ash
      LEFT JOIN users u ON ash.updated_by = u.id
      WHERE ash.application_id = ?
      ORDER BY ash.created_at DESC
    `;
    
    const history = await database.query(sql, [applicationId]);
    
    return history.map(entry => ({
      id: entry.id,
      status: entry.status,
      notes: entry.notes,
      updatedBy: entry.updated_by,
      updatedByName: entry.first_name && entry.last_name 
        ? `${entry.first_name} ${entry.last_name}` 
        : null,
      createdAt: entry.created_at
    }));
  }
  
  static async withdraw(id, candidateId) {
    const application = await this.findById(id);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    
    if (application.candidateId !== candidateId) {
      throw new ValidationError('You can only withdraw your own applications');
    }
    
    if (['hired', 'rejected', 'withdrawn'].includes(application.status)) {
      throw new ValidationError('Cannot withdraw application in current status');
    }
    
    return await this.updateStatus(id, 'withdrawn', 'Application withdrawn by candidate', candidateId);
  }
  
  static async delete(id) {
    const application = await this.findById(id);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    
    try {
      // Delete status history first
      await database.delete('application_status_history', { application_id: id });
      
      // Delete application
      await database.delete('job_applications', { id });
      
      logger.logBusiness('Application deleted', {
        applicationId: id,
        jobTitle: application.jobTitle,
        candidateName: application.candidateName
      });
      
      return true;
    } catch (error) {
      logger.logBusiness('Failed to delete application', {
        applicationId: id,
        error: error.message
      });
      throw error;
    }
  }
  
  static async getApplicationStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_applications,
        COUNT(CASE WHEN status = 'reviewing' THEN 1 END) as reviewing_applications,
        COUNT(CASE WHEN status = 'shortlisted' THEN 1 END) as shortlisted_applications,
        COUNT(CASE WHEN status = 'interview_scheduled' THEN 1 END) as interview_scheduled_applications,
        COUNT(CASE WHEN status = 'interviewed' THEN 1 END) as interviewed_applications,
        COUNT(CASE WHEN status = 'offered' THEN 1 END) as offered_applications,
        COUNT(CASE WHEN status = 'hired' THEN 1 END) as hired_applications,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_applications,
        COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawn_applications,
        COUNT(CASE WHEN applied_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_applications_30_days,
        AVG(expected_salary) as avg_expected_salary
      FROM job_applications
    `;
    
    const [stats] = await database.query(sql);
    return stats;
  }
  
  static async getApplicationsByJob(jobId, options = {}) {
    return await this.findAll({ ...options, jobId });
  }
  
  static async getApplicationsByCandidate(candidateId, options = {}) {
    return await this.findAll({ ...options, candidateId });
  }
  
  static async getApplicationsByCompany(companyId, options = {}) {
    return await this.findAll({ ...options, companyId });
  }
  
  static formatApplication(application) {
    if (!application) return null;
    
    return {
      id: application.id,
      jobId: application.job_id,
      jobTitle: application.job_title,
      jobLocation: application.job_location,
      jobType: application.job_type,
      jobSalaryMin: application.salary_min,
      jobSalaryMax: application.salary_max,
      candidateId: application.candidate_id,
      candidateName: `${application.candidate_first_name} ${application.candidate_last_name}`.trim(),
      candidateEmail: application.candidate_email,
      candidatePhone: application.candidate_phone,
      candidateProfilePicture: application.candidate_profile_picture,
      companyId: application.company_id,
      companyName: application.company_name,
      companyLogo: application.company_logo,
      coverLetter: application.cover_letter,
      resumeUrl: application.resume_url,
      portfolioUrl: application.portfolio_url,
      expectedSalary: application.expected_salary,
      availabilityDate: application.availability_date,
      additionalInfo: application.additional_info,
      status: application.status,
      statusHistory: application.statusHistory || [],
      appliedAt: application.applied_at,
      createdAt: application.created_at,
      updatedAt: application.updated_at
    };
  }
}

module.exports = Application;