const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const db = require('../config/database');

// Get dashboard overview (Role-based)
router.get('/overview',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { period = '30' } = req.query; // days
    const periodDays = parseInt(period);
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let dashboardData = {};
    
    if (req.user.role === 'admin') {
      // Admin Dashboard
      const [userStats] = await db.query(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'candidate' THEN 1 ELSE 0 END) as candidates,
          SUM(CASE WHEN role = 'hr' THEN 1 ELSE 0 END) as hr_users,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_users
        FROM users
      `, [startDate]);
      
      const [jobStats] = await db.query(`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_jobs,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_jobs
        FROM jobs
      `, [startDate]);
      
      const [applicationStats] = await db.query(`
        SELECT 
          COUNT(*) as total_applications,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_applications,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_applications,
          SUM(CASE WHEN applied_at >= ? THEN 1 ELSE 0 END) as new_applications
        FROM applications
      `, [startDate]);
      
      const [companyStats] = await db.query(`
        SELECT 
          COUNT(*) as total_companies,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_companies
        FROM companies
      `, [startDate]);
      
      const [projectStats] = await db.query(`
        SELECT 
          COUNT(*) as total_projects,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_projects
        FROM projects
      `, [startDate]);
      
      const [contentStats] = await db.query(`
        SELECT 
          COUNT(*) as total_content,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_content,
          SUM(views) as total_views
        FROM content
      `);
      
      // Recent activities
      const [recentActivities] = await db.query(`
        SELECT 'user_registration' as type, u.first_name, u.last_name, u.created_at as activity_date
        FROM users u
        WHERE u.created_at >= ?
        UNION ALL
        SELECT 'job_posting' as type, j.title as first_name, c.name as last_name, j.created_at as activity_date
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.created_at >= ?
        UNION ALL
        SELECT 'application_submitted' as type, u.first_name, u.last_name, a.applied_at as activity_date
        FROM applications a
        JOIN users u ON a.candidate_id = u.id
        WHERE a.applied_at >= ?
        ORDER BY activity_date DESC
        LIMIT 10
      `, [startDate, startDate, startDate]);
      
      dashboardData = {
        users: userStats[0],
        jobs: jobStats[0],
        applications: applicationStats[0],
        companies: companyStats[0],
        projects: projectStats[0],
        content: contentStats[0],
        recentActivities
      };
      
    } else if (req.user.role === 'hr') {
      // HR Dashboard
      const [jobStats] = await db.query(`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_jobs,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_jobs
        FROM jobs
        WHERE company_id = ?
      `, [startDate, req.user.companyId]);
      
      const [applicationStats] = await db.query(`
        SELECT 
          COUNT(*) as total_applications,
          SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) as pending_applications,
          SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) as accepted_applications,
          SUM(CASE WHEN a.applied_at >= ? THEN 1 ELSE 0 END) as new_applications
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE j.company_id = ?
      `, [startDate, req.user.companyId]);
      
      const [projectStats] = await db.query(`
        SELECT 
          COUNT(*) as total_projects,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_projects
        FROM projects
        WHERE company_id = ?
      `, [startDate, req.user.companyId]);
      
      const [teamStats] = await db.query(`
        SELECT 
          COUNT(*) as total_employees,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_employees
        FROM users
        WHERE company_id = ? AND role IN ('candidate', 'hr')
      `, [req.user.companyId]);
      
      // Recent applications for company jobs
      const [recentApplications] = await db.query(`
        SELECT 
          a.*,
          u.first_name as candidate_first_name,
          u.last_name as candidate_last_name,
          j.title as job_title
        FROM applications a
        JOIN users u ON a.candidate_id = u.id
        JOIN jobs j ON a.job_id = j.id
        WHERE j.company_id = ? AND a.applied_at >= ?
        ORDER BY a.applied_at DESC
        LIMIT 10
      `, [req.user.companyId, startDate]);
      
      // Upcoming interviews/events
      const [upcomingEvents] = await db.query(`
        SELECT 
          e.*,
          u.first_name as organizer_first_name,
          u.last_name as organizer_last_name
        FROM calendar_events e
        LEFT JOIN users u ON e.organizer_id = u.id
        WHERE (
          e.organizer_id = ? OR 
          EXISTS (
            SELECT 1 FROM event_attendees ea 
            WHERE ea.event_id = e.id AND ea.user_id = ?
          ) OR
          EXISTS (
            SELECT 1 FROM users u2 
            WHERE u2.id = e.organizer_id AND u2.company_id = ?
          )
        )
        AND e.start_time >= NOW()
        AND e.start_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)
        ORDER BY e.start_time ASC
        LIMIT 5
      `, [req.user.id, req.user.id, req.user.companyId]);
      
      dashboardData = {
        jobs: jobStats[0],
        applications: applicationStats[0],
        projects: projectStats[0],
        team: teamStats[0],
        recentApplications,
        upcomingEvents
      };
      
    } else if (req.user.role === 'candidate') {
      // Candidate Dashboard
      const [applicationStats] = await db.query(`
        SELECT 
          COUNT(*) as total_applications,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_applications,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_applications,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_applications,
          SUM(CASE WHEN applied_at >= ? THEN 1 ELSE 0 END) as new_applications
        FROM applications
        WHERE candidate_id = ?
      `, [startDate, req.user.id]);
      
      // Recent applications
      const [recentApplications] = await db.query(`
        SELECT 
          a.*,
          j.title as job_title,
          c.name as company_name
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN companies c ON j.company_id = c.id
        WHERE a.candidate_id = ?
        ORDER BY a.applied_at DESC
        LIMIT 10
      `, [req.user.id]);
      
      // Recommended jobs (simple algorithm based on user's previous applications)
      const [recommendedJobs] = await db.query(`
        SELECT DISTINCT 
          j.*,
          c.name as company_name
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND j.id NOT IN (
          SELECT job_id FROM applications WHERE candidate_id = ?
        )
        AND (
          j.department IN (
            SELECT DISTINCT j2.department 
            FROM applications a2 
            JOIN jobs j2 ON a2.job_id = j2.id 
            WHERE a2.candidate_id = ?
          )
          OR j.location IN (
            SELECT DISTINCT j3.location 
            FROM applications a3 
            JOIN jobs j3 ON a3.job_id = j3.id 
            WHERE a3.candidate_id = ?
          )
        )
        ORDER BY j.created_at DESC
        LIMIT 5
      `, [req.user.id, req.user.id, req.user.id]);
      
      // Upcoming events/interviews
      const [upcomingEvents] = await db.query(`
        SELECT 
          e.*,
          u.first_name as organizer_first_name,
          u.last_name as organizer_last_name
        FROM calendar_events e
        LEFT JOIN users u ON e.organizer_id = u.id
        WHERE (
          e.organizer_id = ? OR 
          EXISTS (
            SELECT 1 FROM event_attendees ea 
            WHERE ea.event_id = e.id AND ea.user_id = ?
          )
        )
        AND e.start_time >= NOW()
        AND e.start_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)
        ORDER BY e.start_time ASC
        LIMIT 5
      `, [req.user.id, req.user.id]);
      
      // Projects user is involved in
      const [userProjects] = await db.query(`
        SELECT 
          p.*,
          c.name as company_name
        FROM projects p
        LEFT JOIN companies c ON p.company_id = c.id
        WHERE p.manager_id = ? OR EXISTS (
          SELECT 1 FROM project_team pt 
          WHERE pt.project_id = p.id AND pt.user_id = ?
        )
        ORDER BY p.updated_at DESC
        LIMIT 5
      `, [req.user.id, req.user.id]);
      
      dashboardData = {
        applications: applicationStats[0],
        recentApplications,
        recommendedJobs,
        upcomingEvents,
        projects: userProjects
      };
    }
    
    logger.logBusiness('Dashboard overview retrieved', {
      requestedBy: req.user.id,
      role: req.user.role,
      period: periodDays
    });
    
    res.json({
      success: true,
      data: dashboardData,
      period: periodDays,
      user: {
        id: req.user.id,
        role: req.user.role,
        name: `${req.user.firstName} ${req.user.lastName}`
      }
    });
  })
);

// Get analytics data (Admin/HR only)
router.get('/analytics',
  authenticateToken,
  authorizeRoles(['admin', 'hr']),
  asyncHandler(async (req, res) => {
    const { period = '30', type = 'overview' } = req.query;
    const periodDays = parseInt(period);
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let analyticsData = {};
    
    if (type === 'overview' || type === 'users') {
      // User analytics
      const userWhereClause = req.user.role === 'hr' ? 'WHERE company_id = ?' : '';
      const userParams = req.user.role === 'hr' ? [req.user.companyId] : [];
      
      const [userTrends] = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          role
        FROM users
        ${userWhereClause}
        ${userWhereClause ? 'AND' : 'WHERE'} created_at >= ?
        GROUP BY DATE(created_at), role
        ORDER BY date ASC
      `, [...userParams, startDate]);
      
      analyticsData.userTrends = userTrends;
    }
    
    if (type === 'overview' || type === 'jobs') {
      // Job analytics
      const jobWhereClause = req.user.role === 'hr' ? 'WHERE company_id = ?' : '';
      const jobParams = req.user.role === 'hr' ? [req.user.companyId] : [];
      
      const [jobTrends] = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          status
        FROM jobs
        ${jobWhereClause}
        ${jobWhereClause ? 'AND' : 'WHERE'} created_at >= ?
        GROUP BY DATE(created_at), status
        ORDER BY date ASC
      `, [...jobParams, startDate]);
      
      const [jobsByDepartment] = await db.query(`
        SELECT 
          department,
          COUNT(*) as count
        FROM jobs
        ${jobWhereClause}
        GROUP BY department
        ORDER BY count DESC
      `, jobParams);
      
      analyticsData.jobTrends = jobTrends;
      analyticsData.jobsByDepartment = jobsByDepartment;
    }
    
    if (type === 'overview' || type === 'applications') {
      // Application analytics
      let applicationQuery = `
        SELECT 
          DATE(a.applied_at) as date,
          COUNT(*) as count,
          a.status
        FROM applications a
      `;
      
      const applicationParams = [];
      
      if (req.user.role === 'hr') {
        applicationQuery += ` JOIN jobs j ON a.job_id = j.id WHERE j.company_id = ?`;
        applicationParams.push(req.user.companyId);
      } else {
        applicationQuery += ` WHERE 1=1`;
      }
      
      applicationQuery += ` AND a.applied_at >= ? GROUP BY DATE(a.applied_at), a.status ORDER BY date ASC`;
      applicationParams.push(startDate);
      
      const [applicationTrends] = await db.query(applicationQuery, applicationParams);
      
      // Application success rate
      let successRateQuery = `
        SELECT 
          COUNT(*) as total_applications,
          SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) as accepted_applications,
          (SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*) * 100) as success_rate
        FROM applications a
      `;
      
      const successRateParams = [];
      
      if (req.user.role === 'hr') {
        successRateQuery += ` JOIN jobs j ON a.job_id = j.id WHERE j.company_id = ?`;
        successRateParams.push(req.user.companyId);
      }
      
      const [successRate] = await db.query(successRateQuery, successRateParams);
      
      analyticsData.applicationTrends = applicationTrends;
      analyticsData.applicationSuccessRate = successRate[0];
    }
    
    if (req.user.role === 'admin' && (type === 'overview' || type === 'companies')) {
      // Company analytics (Admin only)
      const [companyTrends] = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM companies
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [startDate]);
      
      const [companiesByIndustry] = await db.query(`
        SELECT 
          industry,
          COUNT(*) as count
        FROM companies
        GROUP BY industry
        ORDER BY count DESC
      `);
      
      analyticsData.companyTrends = companyTrends;
      analyticsData.companiesByIndustry = companiesByIndustry;
    }
    
    logger.logBusiness('Dashboard analytics retrieved', {
      requestedBy: req.user.id,
      role: req.user.role,
      type,
      period: periodDays
    });
    
    res.json({
      success: true,
      data: analyticsData,
      period: periodDays,
      type
    });
  })
);

// Get quick stats (All authenticated users)
router.get('/quick-stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    let quickStats = {};
    
    if (req.user.role === 'admin') {
      const [stats] = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM jobs WHERE status = 'active') as active_jobs,
          (SELECT COUNT(*) FROM applications WHERE status = 'pending') as pending_applications,
          (SELECT COUNT(*) FROM companies) as total_companies
      `);
      quickStats = stats[0];
      
    } else if (req.user.role === 'hr') {
      const [stats] = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM jobs WHERE company_id = ? AND status = 'active') as active_jobs,
          (SELECT COUNT(*) FROM applications a JOIN jobs j ON a.job_id = j.id WHERE j.company_id = ? AND a.status = 'pending') as pending_applications,
          (SELECT COUNT(*) FROM users WHERE company_id = ? AND role = 'candidate') as company_candidates,
          (SELECT COUNT(*) FROM projects WHERE company_id = ? AND status = 'active') as active_projects
      `, [req.user.companyId, req.user.companyId, req.user.companyId, req.user.companyId]);
      quickStats = stats[0];
      
    } else if (req.user.role === 'candidate') {
      const [stats] = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM applications WHERE candidate_id = ?) as my_applications,
          (SELECT COUNT(*) FROM applications WHERE candidate_id = ? AND status = 'pending') as pending_applications,
          (SELECT COUNT(*) FROM applications WHERE candidate_id = ? AND status = 'accepted') as accepted_applications,
          (SELECT COUNT(*) FROM jobs WHERE status = 'active') as available_jobs
      `, [req.user.id, req.user.id, req.user.id]);
      quickStats = stats[0];
    }
    
    logger.logBusiness('Quick stats retrieved', {
      requestedBy: req.user.id,
      role: req.user.role
    });
    
    res.json({
      success: true,
      data: quickStats
    });
  })
);

// Get notifications/alerts (All authenticated users)
router.get('/notifications',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    
    let notifications = [];
    
    if (req.user.role === 'admin') {
      // Admin notifications
      const [adminNotifications] = await db.query(`
        SELECT 'new_user' as type, CONCAT('New user registered: ', first_name, ' ', last_name) as message, created_at as notification_date
        FROM users
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'new_company' as type, CONCAT('New company registered: ', name) as message, created_at as notification_date
        FROM companies
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'system_alert' as type, 'System maintenance scheduled' as message, NOW() as notification_date
        ORDER BY notification_date DESC
        LIMIT ?
      `, [parseInt(limit)]);
      notifications = adminNotifications;
      
    } else if (req.user.role === 'hr') {
      // HR notifications
      const [hrNotifications] = await db.query(`
        SELECT 'new_application' as type, CONCAT('New application for ', j.title, ' from ', u.first_name, ' ', u.last_name) as message, a.applied_at as notification_date
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN users u ON a.candidate_id = u.id
        WHERE j.company_id = ? AND a.applied_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'interview_reminder' as type, CONCAT('Upcoming interview: ', e.title) as message, e.start_time as notification_date
        FROM calendar_events e
        WHERE e.organizer_id = ? AND e.start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 DAY)
        ORDER BY notification_date DESC
        LIMIT ?
      `, [req.user.companyId, req.user.id, parseInt(limit)]);
      notifications = hrNotifications;
      
    } else if (req.user.role === 'candidate') {
      // Candidate notifications
      const [candidateNotifications] = await db.query(`
        SELECT 'application_update' as type, CONCAT('Application status updated for ', j.title, ': ', a.status) as message, a.updated_at as notification_date
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE a.candidate_id = ? AND a.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'interview_invitation' as type, CONCAT('Interview invitation: ', e.title) as message, ea.invited_at as notification_date
        FROM event_attendees ea
        JOIN calendar_events e ON ea.event_id = e.id
        WHERE ea.user_id = ? AND ea.invited_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'new_job_match' as type, CONCAT('New job match: ', j.title, ' at ', c.name) as message, j.created_at as notification_date
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active' AND j.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
        AND j.id NOT IN (SELECT job_id FROM applications WHERE candidate_id = ?)
        ORDER BY notification_date DESC
        LIMIT ?
      `, [req.user.id, req.user.id, req.user.id, parseInt(limit)]);
      notifications = candidateNotifications;
    }
    
    logger.logBusiness('Dashboard notifications retrieved', {
      requestedBy: req.user.id,
      role: req.user.role,
      notificationCount: notifications.length
    });
    
    res.json({
      success: true,
      data: notifications
    });
  })
);

module.exports = router;