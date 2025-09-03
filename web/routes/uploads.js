const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const db = require('../config/database');

// Ensure upload directories exist
const ensureUploadDirs = async () => {
  const dirs = [
    'uploads/profiles',
    'uploads/resumes',
    'uploads/content',
    'uploads/projects',
    'uploads/companies',
    'uploads/temp'
  ];
  
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
};

// Initialize upload directories
ensureUploadDirs().catch(console.error);

// File type validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'archive': ['application/zip', 'application/x-rar-compressed'],
    'text': ['text/plain', 'text/csv'],
    'video': ['video/mp4', 'video/mpeg', 'video/quicktime'],
    'audio': ['audio/mpeg', 'audio/wav', 'audio/ogg']
  };
  
  const uploadType = req.params.type || req.body.uploadType || 'image';
  let allowed = [];
  
  switch (uploadType) {
    case 'profile':
    case 'company-logo':
    case 'content-image':
      allowed = allowedTypes.image;
      break;
    case 'resume':
    case 'document':
      allowed = [...allowedTypes.document, ...allowedTypes.text];
      break;
    case 'project-file':
      allowed = [...allowedTypes.document, ...allowedTypes.image, ...allowedTypes.archive, ...allowedTypes.text];
      break;
    case 'content-media':
      allowed = [...allowedTypes.image, ...allowedTypes.video, ...allowedTypes.audio];
      break;
    default:
      allowed = allowedTypes.image;
  }
  
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowed.join(', ')}`), false);
  }
};

// Dynamic storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.params.type || req.body.uploadType || 'temp';
    let uploadPath = 'uploads/temp';
    
    switch (uploadType) {
      case 'profile':
        uploadPath = 'uploads/profiles';
        break;
      case 'resume':
        uploadPath = 'uploads/resumes';
        break;
      case 'content-image':
      case 'content-media':
        uploadPath = 'uploads/content';
        break;
      case 'project-file':
        uploadPath = 'uploads/projects';
        break;
      case 'company-logo':
        uploadPath = 'uploads/companies';
        break;
      default:
        uploadPath = 'uploads/temp';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}_${uniqueSuffix}${ext}`);
  }
});

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per request
  }
});

// Upload profile picture
router.post('/profile',
  authenticateToken,
  upload.single('profilePicture'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const filePath = req.file.path.replace(/\\/g, '/');
    const fileUrl = `/${filePath}`;
    
    // Update user profile picture in database
    await db.query(
      'UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?',
      [fileUrl, req.user.id]
    );
    
    logger.logFileOperation('Profile picture uploaded', {
      userId: req.user.id,
      fileName: req.file.filename,
      fileSize: req.file.size,
      filePath: filePath
    });
    
    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: fileUrl,
        fileSize: req.file.size
      }
    });
  })
);

// Upload resume
router.post('/resume',
  authenticateToken,
  authorizeRoles(['candidate']),
  upload.single('resume'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No resume file uploaded'
      });
    }
    
    const filePath = req.file.path.replace(/\\/g, '/');
    const fileUrl = `/${filePath}`;
    
    // Update user resume in database
    await db.query(
      'UPDATE users SET resume_url = ?, updated_at = NOW() WHERE id = ?',
      [fileUrl, req.user.id]
    );
    
    logger.logFileOperation('Resume uploaded', {
      userId: req.user.id,
      fileName: req.file.filename,
      fileSize: req.file.size,
      filePath: filePath
    });
    
    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: fileUrl,
        fileSize: req.file.size
      }
    });
  })
);

// Upload company logo
router.post('/company-logo',
  authenticateToken,
  authorizeRoles(['admin', 'hr']),
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file uploaded'
      });
    }
    
    const { companyId } = req.body;
    
    // Verify company access for HR users
    if (req.user.role === 'hr' && req.user.companyId !== parseInt(companyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only upload logos for your own company'
      });
    }
    
    const filePath = req.file.path.replace(/\\/g, '/');
    const fileUrl = `/${filePath}`;
    
    // Update company logo in database
    await db.query(
      'UPDATE companies SET logo_url = ?, updated_at = NOW() WHERE id = ?',
      [fileUrl, companyId]
    );
    
    logger.logFileOperation('Company logo uploaded', {
      userId: req.user.id,
      companyId: companyId,
      fileName: req.file.filename,
      fileSize: req.file.size,
      filePath: filePath
    });
    
    res.json({
      success: true,
      message: 'Company logo uploaded successfully',
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: fileUrl,
        fileSize: req.file.size
      }
    });
  })
);

// Upload content media (images, videos, etc.)
router.post('/content-media',
  authenticateToken,
  authorizeRoles(['admin', 'hr']),
  upload.array('media', 5),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No media files uploaded'
      });
    }
    
    const uploadedFiles = req.files.map(file => {
      const filePath = file.path.replace(/\\/g, '/');
      return {
        fileName: file.filename,
        originalName: file.originalname,
        fileUrl: `/${filePath}`,
        fileSize: file.size,
        mimeType: file.mimetype
      };
    });
    
    logger.logFileOperation('Content media uploaded', {
      userId: req.user.id,
      fileCount: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0)
    });
    
    res.json({
      success: true,
      message: `${req.files.length} media file(s) uploaded successfully`,
      data: uploadedFiles
    });
  })
);

// Upload project files
router.post('/project-files/:projectId',
  authenticateToken,
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }
    
    // Verify project access
    const [project] = await db.query(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );
    
    if (project.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    
    // Check if user has access to this project
    const [access] = await db.query(`
      SELECT 1 FROM projects p
      WHERE p.id = ? AND (
        p.manager_id = ? OR
        EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = ?) OR
        (? = 'admin') OR
        (? = 'hr' AND p.company_id = ?)
      )
    `, [projectId, req.user.id, req.user.id, req.user.role, req.user.role, req.user.companyId]);
    
    if (access.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to upload files to this project'
      });
    }
    
    // Save file information to database
    const fileInserts = req.files.map(file => {
      const filePath = file.path.replace(/\\/g, '/');
      return [
        projectId,
        file.filename,
        file.originalname,
        `/${filePath}`,
        file.size,
        file.mimetype,
        req.user.id
      ];
    });
    
    await db.query(`
      INSERT INTO project_files (project_id, file_name, original_name, file_url, file_size, mime_type, uploaded_by)
      VALUES ?
    `, [fileInserts]);
    
    const uploadedFiles = req.files.map(file => {
      const filePath = file.path.replace(/\\/g, '/');
      return {
        fileName: file.filename,
        originalName: file.originalname,
        fileUrl: `/${filePath}`,
        fileSize: file.size,
        mimeType: file.mimetype
      };
    });
    
    logger.logFileOperation('Project files uploaded', {
      userId: req.user.id,
      projectId: projectId,
      fileCount: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0)
    });
    
    res.json({
      success: true,
      message: `${req.files.length} file(s) uploaded successfully to project`,
      data: uploadedFiles
    });
  })
);

// Get uploaded files for a project
router.get('/project-files/:projectId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify project access
    const [access] = await db.query(`
      SELECT 1 FROM projects p
      WHERE p.id = ? AND (
        p.manager_id = ? OR
        EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = ?) OR
        (? = 'admin') OR
        (? = 'hr' AND p.company_id = ?)
      )
    `, [projectId, req.user.id, req.user.id, req.user.role, req.user.role, req.user.companyId]);
    
    if (access.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view files for this project'
      });
    }
    
    const [files] = await db.query(`
      SELECT 
        pf.*,
        u.first_name as uploader_first_name,
        u.last_name as uploader_last_name
      FROM project_files pf
      LEFT JOIN users u ON pf.uploaded_by = u.id
      WHERE pf.project_id = ?
      ORDER BY pf.uploaded_at DESC
      LIMIT ? OFFSET ?
    `, [projectId, parseInt(limit), offset]);
    
    const [totalCount] = await db.query(
      'SELECT COUNT(*) as count FROM project_files WHERE project_id = ?',
      [projectId]
    );
    
    res.json({
      success: true,
      data: files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount[0].count,
        pages: Math.ceil(totalCount[0].count / limit)
      }
    });
  })
);

// Delete uploaded file
router.delete('/file/:fileId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { type } = req.query; // 'project', 'content', etc.
    
    let fileRecord = null;
    let canDelete = false;
    
    if (type === 'project') {
      // Check project file access
      const [projectFile] = await db.query(`
        SELECT 
          pf.*,
          p.manager_id,
          p.company_id
        FROM project_files pf
        JOIN projects p ON pf.project_id = p.id
        WHERE pf.id = ?
      `, [fileId]);
      
      if (projectFile.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      fileRecord = projectFile[0];
      canDelete = (
        req.user.role === 'admin' ||
        fileRecord.uploaded_by === req.user.id ||
        fileRecord.manager_id === req.user.id ||
        (req.user.role === 'hr' && fileRecord.company_id === req.user.companyId)
      );
      
      if (canDelete) {
        await db.query('DELETE FROM project_files WHERE id = ?', [fileId]);
      }
    }
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to delete this file'
      });
    }
    
    // Delete physical file
    try {
      const filePath = fileRecord.file_url.substring(1); // Remove leading slash
      await fs.unlink(filePath);
    } catch (error) {
      logger.logError('File deletion error', error, {
        fileId: fileId,
        filePath: fileRecord.file_url
      });
    }
    
    logger.logFileOperation('File deleted', {
      userId: req.user.id,
      fileId: fileId,
      fileName: fileRecord.file_name,
      type: type
    });
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  })
);

// Get file info
router.get('/file-info/:fileId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { type } = req.query;
    
    let fileInfo = null;
    
    if (type === 'project') {
      const [projectFile] = await db.query(`
        SELECT 
          pf.*,
          u.first_name as uploader_first_name,
          u.last_name as uploader_last_name,
          p.title as project_title
        FROM project_files pf
        LEFT JOIN users u ON pf.uploaded_by = u.id
        LEFT JOIN projects p ON pf.project_id = p.id
        WHERE pf.id = ?
      `, [fileId]);
      
      if (projectFile.length > 0) {
        fileInfo = projectFile[0];
      }
    }
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    res.json({
      success: true,
      data: fileInfo
    });
  })
);

// Clean up temporary files (Admin only)
router.post('/cleanup-temp',
  authenticateToken,
  authorizeRoles(['admin']),
  asyncHandler(async (req, res) => {
    const tempDir = 'uploads/temp';
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    
    try {
      const files = await fs.readdir(tempDir);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      logger.logFileOperation('Temporary files cleaned up', {
        userId: req.user.id,
        deletedCount: deletedCount
      });
      
      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} temporary files`,
        data: { deletedCount }
      });
    } catch (error) {
      logger.logError('Temp file cleanup error', error);
      res.status(500).json({
        success: false,
        message: 'Error cleaning up temporary files'
      });
    }
  })
);

module.exports = router;