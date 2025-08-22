const express = require('express');
const { query, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, checkPermission, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation middleware
const validateAuditQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('userId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
  query('action')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Action filter must be between 1 and 100 characters'),
  query('resourceType')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Resource type filter must be between 1 and 50 characters'),
  query('ipAddress')
    .optional()
    .isIP()
    .withMessage('IP address must be a valid IP address')
];

// Get audit logs (admin only)
router.get('/', requireAdmin, validateAuditQuery, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';
  const userId = req.query.userId || '';
  const action = req.query.action || '';
  const resourceType = req.query.resourceType || '';
  const ipAddress = req.query.ipAddress || '';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (startDate) {
    whereClause += ' AND al.timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND al.timestamp <= ?';
    params.push(endDate);
  }

  if (userId) {
    whereClause += ' AND al.user_id = ?';
    params.push(userId);
  }

  if (action) {
    whereClause += ' AND al.action LIKE ?';
    params.push(`%${action}%`);
  }

  if (resourceType) {
    whereClause += ' AND al.resource_type = ?';
    params.push(resourceType);
  }

  if (ipAddress) {
    whereClause += ' AND al.ip_address = ?';
    params.push(ipAddress);
  }

  // Get total count
  const [countResult] = await pool.execute(`
    SELECT COUNT(*) as total 
    FROM audit_logs al 
    ${whereClause}
  `, params);

  const total = countResult[0].total;

  // Get audit logs with pagination
  const [auditLogs] = await pool.execute(`
    SELECT 
      al.id, al.user_id, al.action, al.resource_type, al.resource_id, 
      al.details, al.ip_address, al.user_agent, al.timestamp,
      u.username, u.email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${whereClause}
    ORDER BY al.timestamp DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Parse JSON details
  auditLogs.forEach(log => {
    if (log.details && typeof log.details === 'string') {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        log.details = { raw: log.details };
      }
    }
  });

  res.json({
    auditLogs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get audit logs for specific user (users can view their own logs)
router.get('/user/:userId', checkPermission('audit', 'read'), validateAuditQuery, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const targetUserId = parseInt(req.params.userId);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';
  const action = req.query.action || '';
  const resourceType = req.query.resourceType || '';

  // Users can only view their own audit logs unless they have admin privileges
  if (req.user.id !== targetUserId && !req.user.roles?.some(r => ['admin', 'super_admin'].includes(r.name))) {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  let whereClause = 'WHERE al.user_id = ?';
  let params = [targetUserId];

  if (startDate) {
    whereClause += ' AND al.timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND al.timestamp <= ?';
    params.push(endDate);
  }

  if (action) {
    whereClause += ' AND al.action LIKE ?';
    params.push(`%${action}%`);
  }

  if (resourceType) {
    whereClause += ' AND al.resource_type = ?';
    params.push(resourceType);
  }

  // Get total count
  const [countResult] = await pool.execute(`
    SELECT COUNT(*) as total 
    FROM audit_logs al 
    ${whereClause}
  `, params);

  const total = countResult[0].total;

  // Get audit logs with pagination
  const [auditLogs] = await pool.execute(`
    SELECT 
      al.id, al.user_id, al.action, al.resource_type, al.resource_id, 
      al.details, al.ip_address, al.user_agent, al.timestamp,
      u.username, u.email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${whereClause}
    ORDER BY al.timestamp DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Parse JSON details
  auditLogs.forEach(log => {
    if (log.details && typeof log.details === 'string') {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        log.details = { raw: log.details };
      }
    }
  });

  res.json({
    auditLogs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get audit logs for specific resource
router.get('/resource/:resourceType/:resourceId', checkPermission('audit', 'read'), [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('action')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Action filter must be between 1 and 100 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const resourceType = req.params.resourceType;
  const resourceId = parseInt(req.params.resourceId);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';
  const action = req.query.action || '';

  let whereClause = 'WHERE al.resource_type = ? AND al.resource_id = ?';
  let params = [resourceType, resourceId];

  if (startDate) {
    whereClause += ' AND al.timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND al.timestamp <= ?';
    params.push(endDate);
  }

  if (action) {
    whereClause += ' AND al.action LIKE ?';
    params.push(`%${action}%`);
  }

  // Get total count
  const [countResult] = await pool.execute(`
    SELECT COUNT(*) as total 
    FROM audit_logs al 
    ${whereClause}
  `, params);

  const total = countResult[0].total;

  // Get audit logs with pagination
  const [auditLogs] = await pool.execute(`
    SELECT 
      al.id, al.user_id, al.action, al.resource_type, al.resource_id, 
      al.details, al.ip_address, al.user_agent, al.timestamp,
      u.username, u.email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${whereClause}
    ORDER BY al.timestamp DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Parse JSON details
  auditLogs.forEach(log => {
    if (log.details && typeof log.details === 'string') {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        log.details = { raw: log.details };
      }
    }
  });

  res.json({
    auditLogs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get audit statistics
router.get('/stats', requireAdmin, [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (startDate) {
    whereClause += ' AND al.timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND al.timestamp <= ?';
    params.push(endDate);
  }

  // Get action statistics
  const [actionStats] = await pool.execute(`
    SELECT 
      al.action,
      COUNT(*) as count
    FROM audit_logs al
    ${whereClause}
    GROUP BY al.action
    ORDER BY count DESC
    LIMIT 20
  `, params);

  // Get resource type statistics
  const [resourceStats] = await pool.execute(`
    SELECT 
      al.resource_type,
      COUNT(*) as count
    FROM audit_logs al
    ${whereClause}
    GROUP BY al.resource_type
    ORDER BY count DESC
  `, params);

  // Get user activity statistics
  const [userStats] = await pool.execute(`
    SELECT 
      u.username,
      COUNT(al.id) as action_count,
      MAX(al.timestamp) as last_action
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${whereClause}
    GROUP BY al.user_id, u.username
    ORDER BY action_count DESC
    LIMIT 20
  `, params);

  // Get daily activity for the last 30 days
  const [dailyStats] = await pool.execute(`
    SELECT 
      DATE(al.timestamp) as date,
      COUNT(*) as count
    FROM audit_logs al
    ${whereClause}
    AND al.timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(al.timestamp)
    ORDER BY date DESC
  `, params);

  // Get total counts
  const [totalStats] = await pool.execute(`
    SELECT 
      COUNT(*) as total_actions,
      COUNT(DISTINCT al.user_id) as unique_users,
      COUNT(DISTINCT al.resource_type) as unique_resources
    FROM audit_logs al
    ${whereClause}
  `, params);

  res.json({
    actionStats,
    resourceStats,
    userStats,
    dailyStats,
    totalStats: totalStats[0]
  });
}));

// Export audit logs (admin only)
router.get('/export', requireAdmin, [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('format')
    .optional()
    .isIn(['csv', 'json'])
    .withMessage('Format must be csv or json')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';
  const format = req.query.format || 'json';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (startDate) {
    whereClause += ' AND al.timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND al.timestamp <= ?';
    params.push(endDate);
  }

  // Get all audit logs for export
  const [auditLogs] = await pool.execute(`
    SELECT 
      al.id, al.user_id, al.action, al.resource_type, al.resource_id, 
      al.details, al.ip_address, al.user_agent, al.timestamp,
      u.username, u.email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${whereClause}
    ORDER BY al.timestamp DESC
  `, params);

  // Parse JSON details
  auditLogs.forEach(log => {
    if (log.details && typeof log.details === 'string') {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        log.details = { raw: log.details };
      }
    }
  });

  if (format === 'csv') {
    // Convert to CSV format
    const csvHeaders = ['ID', 'User ID', 'Username', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Timestamp'];
    const csvRows = auditLogs.map(log => [
      log.id,
      log.user_id || '',
      log.username || '',
      log.action,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
      log.timestamp
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } else {
    // JSON format
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ auditLogs });
  }

  // Log export action
  logger.logAudit(req.user.id, 'AUDIT_EXPORTED', 'audit_logs', null, {
    format,
    startDate,
    endDate,
    recordCount: auditLogs.length,
    ip: req.ip
  });
}));

// Get recent activity for dashboard
router.get('/recent', checkPermission('audit', 'read'), [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const limit = parseInt(req.query.limit) || 20;

  // Get recent audit logs
  const [recentLogs] = await pool.execute(`
    SELECT 
      al.id, al.user_id, al.action, al.resource_type, al.resource_id, 
      al.details, al.ip_address, al.timestamp,
      u.username, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC
    LIMIT ?
  `, [limit]);

  // Parse JSON details
  recentLogs.forEach(log => {
    if (log.details && typeof log.details === 'string') {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        log.details = { raw: log.details };
      }
    }
  });

  res.json({ recentLogs });
}));

module.exports = router;

