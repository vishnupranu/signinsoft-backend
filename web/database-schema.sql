-- SignInSoft Database Schema
-- Comprehensive database design for HR management system
-- Supports admin, HR, and candidate roles with authentication and application flows

-- Create database
CREATE DATABASE IF NOT EXISTS signinsoft_db;
USE signinsoft_db;

-- =============================================
-- USER MANAGEMENT TABLES
-- =============================================

-- Roles table
CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    role_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

-- User sessions for authentication
CREATE TABLE user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password reset tokens
CREATE TABLE password_resets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Email verification tokens
CREATE TABLE email_verifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- COMPANY AND DEPARTMENT MANAGEMENT
-- =============================================

-- Companies table
CREATE TABLE companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    website VARCHAR(255),
    logo_url VARCHAR(500),
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    industry VARCHAR(100),
    size_range VARCHAR(50), -- e.g., '1-10', '11-50', '51-200', etc.
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Departments table
CREATE TABLE departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- User company associations
CREATE TABLE user_companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    company_id INT NOT NULL,
    department_id INT,
    position VARCHAR(255),
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- =============================================
-- JOB MANAGEMENT
-- =============================================

-- Job categories
CREATE TABLE job_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job postings
CREATE TABLE jobs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    department_id INT,
    category_id INT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT,
    responsibilities TEXT,
    benefits TEXT,
    salary_min DECIMAL(10,2),
    salary_max DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    employment_type ENUM('full-time', 'part-time', 'contract', 'internship', 'temporary') DEFAULT 'full-time',
    experience_level ENUM('entry', 'mid', 'senior', 'executive') DEFAULT 'mid',
    location VARCHAR(255),
    remote_allowed BOOLEAN DEFAULT FALSE,
    status ENUM('draft', 'active', 'paused', 'closed', 'expired') DEFAULT 'draft',
    application_deadline DATE,
    posted_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Job skills/requirements
CREATE TABLE skills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job-skill associations
CREATE TABLE job_skills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NOT NULL,
    skill_id INT NOT NULL,
    required_level ENUM('basic', 'intermediate', 'advanced', 'expert') DEFAULT 'intermediate',
    is_required BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE KEY unique_job_skill (job_id, skill_id)
);

-- =============================================
-- CANDIDATE AND APPLICATION MANAGEMENT
-- =============================================

-- Candidate profiles
CREATE TABLE candidates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    resume_url VARCHAR(500),
    cover_letter TEXT,
    portfolio_url VARCHAR(500),
    linkedin_url VARCHAR(500),
    github_url VARCHAR(500),
    current_position VARCHAR(255),
    current_company VARCHAR(255),
    experience_years INT DEFAULT 0,
    expected_salary DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    availability_date DATE,
    willing_to_relocate BOOLEAN DEFAULT FALSE,
    preferred_locations JSON, -- Array of location preferences
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Candidate skills
CREATE TABLE candidate_skills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    candidate_id INT NOT NULL,
    skill_id INT NOT NULL,
    proficiency_level ENUM('basic', 'intermediate', 'advanced', 'expert') DEFAULT 'intermediate',
    years_experience INT DEFAULT 0,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE KEY unique_candidate_skill (candidate_id, skill_id)
);

-- Work experience
CREATE TABLE work_experiences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    candidate_id INT NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- Education
CREATE TABLE educations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    candidate_id INT NOT NULL,
    institution VARCHAR(255) NOT NULL,
    degree VARCHAR(255) NOT NULL,
    field_of_study VARCHAR(255),
    start_date DATE,
    end_date DATE,
    gpa DECIMAL(3,2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- Job applications
CREATE TABLE applications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NOT NULL,
    candidate_id INT NOT NULL,
    status ENUM('submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'hired', 'rejected', 'withdrawn') DEFAULT 'submitted',
    cover_letter TEXT,
    resume_url VARCHAR(500),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    UNIQUE KEY unique_job_candidate (job_id, candidate_id)
);

-- Application status history
CREATE TABLE application_status_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    application_id INT NOT NULL,
    status ENUM('submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'hired', 'rejected', 'withdrawn') NOT NULL,
    notes TEXT,
    changed_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- =============================================
-- INTERVIEW MANAGEMENT
-- =============================================

-- Interview types
CREATE TABLE interview_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    duration_minutes INT DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interviews
CREATE TABLE interviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    application_id INT NOT NULL,
    type_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INT DEFAULT 60,
    location VARCHAR(255),
    meeting_url VARCHAR(500),
    status ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
    notes TEXT,
    feedback TEXT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (type_id) REFERENCES interview_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Interview participants (interviewers)
CREATE TABLE interview_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    interview_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('interviewer', 'observer', 'coordinator') DEFAULT 'interviewer',
    feedback TEXT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_interview_participant (interview_id, user_id)
);

-- =============================================
-- CONTENT MANAGEMENT
-- =============================================

-- Content categories
CREATE TABLE content_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content items (blog posts, articles, etc.)
CREATE TABLE contents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    featured_image_url VARCHAR(500),
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    published_at TIMESTAMP NULL,
    author_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES content_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Content tags
CREATE TABLE tags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content-tag associations
CREATE TABLE content_tags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    content_id INT NOT NULL,
    tag_id INT NOT NULL,
    FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_content_tag (content_id, tag_id)
);

-- =============================================
-- PROJECT MANAGEMENT
-- =============================================

-- Projects
CREATE TABLE projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled') DEFAULT 'planning',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    start_date DATE,
    end_date DATE,
    budget DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'USD',
    manager_id INT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Project team members
CREATE TABLE project_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(100),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_project_member (project_id, user_id)
);

-- Tasks
CREATE TABLE tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('todo', 'in_progress', 'review', 'done', 'cancelled') DEFAULT 'todo',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    assigned_to INT,
    due_date DATE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- =============================================
-- CALENDAR AND EVENTS
-- =============================================

-- Events
CREATE TABLE events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    location VARCHAR(255),
    meeting_url VARCHAR(500),
    type ENUM('meeting', 'interview', 'deadline', 'reminder', 'holiday', 'other') DEFAULT 'meeting',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    is_all_day BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(255), -- RRULE format for recurring events
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Event participants
CREATE TABLE event_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('invited', 'accepted', 'declined', 'tentative') DEFAULT 'invited',
    response_at TIMESTAMP NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_event_participant (event_id, user_id)
);

-- =============================================
-- NOTIFICATIONS AND MESSAGING
-- =============================================

-- Notifications
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    category ENUM('application', 'interview', 'project', 'system', 'reminder') DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    action_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System settings
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_active ON users(is_active);

-- Session indexes
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Job indexes
CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_category ON jobs(category_id);
CREATE INDEX idx_jobs_posted_date ON jobs(created_at);

-- Application indexes
CREATE INDEX idx_applications_job ON applications(job_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_date ON applications(applied_at);

-- Interview indexes
CREATE INDEX idx_interviews_application ON interviews(application_id);
CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at);
CREATE INDEX idx_interviews_status ON interviews(status);

-- Content indexes
CREATE INDEX idx_contents_status ON contents(status);
CREATE INDEX idx_contents_author ON contents(author_id);
CREATE INDEX idx_contents_published ON contents(published_at);
CREATE INDEX idx_contents_slug ON contents(slug);

-- Project indexes
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_manager ON projects(manager_id);

-- Task indexes
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Event indexes
CREATE INDEX idx_events_start_time ON events(start_datetime);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_creator ON events(created_by);

-- Notification indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- =============================================
-- INITIAL DATA INSERTION
-- =============================================

-- Insert default roles
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'System Administrator', '{"all": true}'),
('hr', 'Human Resources Manager', '{"jobs": ["create", "read", "update", "delete"], "applications": ["read", "update"], "interviews": ["create", "read", "update", "delete"], "candidates": ["read"], "projects": ["read", "update"], "content": ["create", "read", "update", "delete"]}'),
('candidate', 'Job Candidate', '{"applications": ["create", "read"], "profile": ["read", "update"], "interviews": ["read"]}');

-- Insert job categories
INSERT INTO job_categories (name, description) VALUES
('Technology', 'Software development, IT, and technical roles'),
('Marketing', 'Marketing, advertising, and promotional roles'),
('Sales', 'Sales and business development positions'),
('Human Resources', 'HR, recruitment, and people management'),
('Finance', 'Accounting, finance, and business analysis'),
('Operations', 'Operations, logistics, and process management'),
('Design', 'UI/UX, graphic design, and creative roles'),
('Customer Service', 'Support, customer success, and service roles');

-- Insert common skills
INSERT INTO skills (name, category) VALUES
('JavaScript', 'Programming'),
('Python', 'Programming'),
('Java', 'Programming'),
('React', 'Frontend'),
('Node.js', 'Backend'),
('SQL', 'Database'),
('Project Management', 'Management'),
('Communication', 'Soft Skills'),
('Leadership', 'Management'),
('Problem Solving', 'Soft Skills'),
('Digital Marketing', 'Marketing'),
('Data Analysis', 'Analytics'),
('UI/UX Design', 'Design'),
('Customer Service', 'Service');

-- Insert interview types
INSERT INTO interview_types (name, description, duration_minutes) VALUES
('Phone Screening', 'Initial phone interview to assess basic qualifications', 30),
('Technical Interview', 'In-depth technical assessment and coding challenges', 90),
('Behavioral Interview', 'Assessment of soft skills and cultural fit', 60),
('Panel Interview', 'Interview with multiple team members', 75),
('Final Interview', 'Final round with senior management', 45);

-- Insert content categories
INSERT INTO content_categories (name, description) VALUES
('Company News', 'Company announcements and updates'),
('Industry Insights', 'Industry trends and analysis'),
('Career Tips', 'Job search and career development advice'),
('Technology', 'Technical articles and tutorials'),
('Culture', 'Company culture and employee stories');

-- Insert system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('site_name', 'SignInSoft', 'Application name'),
('site_description', 'Professional HR Management System', 'Application description'),
('max_file_size', '10485760', 'Maximum file upload size in bytes (10MB)'),
('allowed_file_types', 'pdf,doc,docx,jpg,jpeg,png', 'Allowed file extensions for uploads'),
('session_timeout', '86400', 'Session timeout in seconds (24 hours)'),
('password_min_length', '8', 'Minimum password length'),
('email_verification_required', 'true', 'Whether email verification is required for new accounts');

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- View for user details with role information
CREATE VIEW user_details AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) as full_name,
    u.phone,
    u.avatar_url,
    u.is_active,
    u.email_verified,
    u.last_login,
    u.created_at,
    r.name as role_name,
    r.description as role_description
FROM users u
JOIN roles r ON u.role_id = r.id;

-- View for job listings with company information
CREATE VIEW job_listings AS
SELECT 
    j.id,
    j.title,
    j.description,
    j.employment_type,
    j.experience_level,
    j.location,
    j.remote_allowed,
    j.salary_min,
    j.salary_max,
    j.currency,
    j.status,
    j.application_deadline,
    j.created_at,
    c.name as company_name,
    c.logo_url as company_logo,
    d.name as department_name,
    cat.name as category_name,
    CONCAT(u.first_name, ' ', u.last_name) as posted_by_name
FROM jobs j
JOIN companies c ON j.company_id = c.id
LEFT JOIN departments d ON j.department_id = d.id
LEFT JOIN job_categories cat ON j.category_id = cat.id
JOIN users u ON j.posted_by = u.id;

-- View for application details
CREATE VIEW application_details AS
SELECT 
    a.id,
    a.status,
    a.applied_at,
    a.updated_at,
    j.title as job_title,
    c.name as company_name,
    CONCAT(u.first_name, ' ', u.last_name) as candidate_name,
    u.email as candidate_email,
    cand.resume_url,
    cand.current_position,
    cand.experience_years
FROM applications a
JOIN jobs j ON a.job_id = j.id
JOIN companies c ON j.company_id = c.id
JOIN candidates cand ON a.candidate_id = cand.id
JOIN users u ON cand.user_id = u.id;

-- =============================================
-- STORED PROCEDURES
-- =============================================

DELIMITER //

-- Procedure to update application status with history tracking
CREATE PROCEDURE UpdateApplicationStatus(
    IN app_id INT,
    IN new_status VARCHAR(50),
    IN notes TEXT,
    IN changed_by_user_id INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Update application status
    UPDATE applications 
    SET status = new_status, updated_at = CURRENT_TIMESTAMP 
    WHERE id = app_id;
    
    -- Insert status history record
    INSERT INTO application_status_history (application_id, status, notes, changed_by)
    VALUES (app_id, new_status, notes, changed_by_user_id);
    
    COMMIT;
END //

-- Procedure to get user statistics
CREATE PROCEDURE GetUserStats(
    IN user_id INT
)
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM applications a 
         JOIN candidates c ON a.candidate_id = c.id 
         WHERE c.user_id = user_id) as total_applications,
        (SELECT COUNT(*) FROM applications a 
         JOIN candidates c ON a.candidate_id = c.id 
         WHERE c.user_id = user_id AND a.status = 'hired') as hired_count,
        (SELECT COUNT(*) FROM interviews i 
         JOIN applications a ON i.application_id = a.id 
         JOIN candidates c ON a.candidate_id = c.id 
         WHERE c.user_id = user_id) as total_interviews,
        (SELECT COUNT(*) FROM jobs WHERE posted_by = user_id) as jobs_posted;
END //

DELIMITER ;

-- =============================================
-- TRIGGERS
-- =============================================

DELIMITER //

-- Trigger to automatically create candidate profile when user with candidate role is created
CREATE TRIGGER create_candidate_profile
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    IF NEW.role_id = (SELECT id FROM roles WHERE name = 'candidate') THEN
        INSERT INTO candidates (user_id) VALUES (NEW.id);
    END IF;
END //

-- Trigger to update job application count when application status changes
CREATE TRIGGER update_application_stats
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
    -- This could be used to update cached statistics
    -- Implementation depends on specific requirements
    NULL;
END //

DELIMITER ;

-- =============================================
-- SECURITY AND CLEANUP
-- =============================================

-- Create cleanup procedure for expired sessions and tokens
DELIMITER //

CREATE PROCEDURE CleanupExpiredData()
BEGIN
    -- Remove expired sessions
    DELETE FROM user_sessions WHERE expires_at < NOW();
    
    -- Remove expired password reset tokens
    DELETE FROM password_resets WHERE expires_at < NOW();
    
    -- Remove expired email verification tokens
    DELETE FROM email_verifications WHERE expires_at < NOW();
    
    -- Remove old notifications (older than 90 days)
    DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
END //

DELIMITER ;

-- Create event scheduler to run cleanup daily (if event scheduler is enabled)
-- CREATE EVENT daily_cleanup
-- ON SCHEDULE EVERY 1 DAY
-- STARTS CURRENT_TIMESTAMP
-- DO CALL CleanupExpiredData();

COMMIT;