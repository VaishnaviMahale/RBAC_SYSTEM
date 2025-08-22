const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, checkPermission, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation middleware
const validateUserUpdate = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const validateRoleAssignment = [
  body('roleId')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date')
];

// Get all users (admin only)
router.get('/', requireAdmin, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters'),
  query('role')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Role filter must be between 1 and 50 characters'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'all'])
    .withMessage('Status must be active, inactive, or all')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const roleFilter = req.query.role || '';
  const statusFilter = req.query.status || 'all';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (search) {
    whereClause += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (statusFilter !== 'all') {
    whereClause += ' AND u.is_active = ?';
    params.push(statusFilter === 'active');
  }

  // Get total count
  let countQuery = `
    SELECT COUNT(DISTINCT u.id) as total
    FROM users u
    ${roleFilter ? 'JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id' : ''}
    ${whereClause}
    ${roleFilter ? 'AND r.name = ?' : ''}
  `;

  if (roleFilter) {
    params.push(roleFilter);
  }

  const [countResult] = await pool.execute(countQuery, params);
  const total = countResult[0].total;

  // Get users with pagination
  let usersQuery = `
    SELECT DISTINCT 
      u.id, u.username, u.email, u.first_name, u.last_name, 
      u.is_active, u.is_verified, u.last_login, u.created_at, u.updated_at
    FROM users u
    ${roleFilter ? 'JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id' : ''}
    ${whereClause}
    ${roleFilter ? 'AND r.name = ?' : ''}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;

  if (roleFilter) {
    params.push(roleFilter);
  }
  params.push(limit, offset);

  const [users] = await pool.execute(usersQuery, params);

  // Get roles for each user
  for (let user of users) {
    const [roles] = await pool.execute(`
      SELECT r.id, r.name, r.description
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE
    `, [user.id]);
    user.roles = roles;
  }

  res.json({
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get user by ID
router.get('/:id', checkPermission('users', 'read'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  // Users can only view their own profile unless they have read permission for all users
  if (req.user.id !== userId && !req.user.permissions?.some(p => p.resource === 'users' && p.action === 'read')) {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  const [users] = await pool.execute(`
    SELECT id, username, email, first_name, last_name, is_active, is_verified, 
           last_login, created_at, updated_at
    FROM users WHERE id = ?
  `, [userId]);

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Get user roles
  const [roles] = await pool.execute(`
    SELECT r.id, r.name, r.description
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE
  `, [userId]);

  // Get user permissions
  const [permissions] = await pool.execute(`
    SELECT DISTINCT p.name, p.resource, p.action
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN user_roles ur ON rp.role_id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND rp.is_active = TRUE AND p.is_active = TRUE
  `, [userId]);

  const user = {
    ...users[0],
    roles,
    permissions
  };

  res.json({ user });
}));

// Update user
router.put('/:id', checkPermission('users', 'update'), validateUserUpdate, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const userId = parseInt(req.params.id);
  const { firstName, lastName, email, isActive } = req.body;

  // Check if user exists
  const [existingUsers] = await pool.execute(
    'SELECT id FROM users WHERE id = ?',
    [userId]
  );

  if (existingUsers.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Check email uniqueness if updating email
  if (email) {
    const [emailCheck] = await pool.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, userId]
    );

    if (emailCheck.length > 0) {
      return res.status(400).json({
        error: 'Email already in use',
        code: 'EMAIL_EXISTS'
      });
    }
  }

  // Build update query
  const updateFields = [];
  const updateParams = [];

  if (firstName !== undefined) {
    updateFields.push('first_name = ?');
    updateParams.push(firstName);
  }

  if (lastName !== undefined) {
    updateFields.push('last_name = ?');
    updateParams.push(lastName);
  }

  if (email !== undefined) {
    updateFields.push('email = ?');
    updateParams.push(email);
  }

  if (isActive !== undefined) {
    updateFields.push('is_active = ?');
    updateParams.push(isActive);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({
      error: 'No fields to update',
      code: 'NO_UPDATE_FIELDS'
    });
  }

  updateParams.push(userId);

  // Update user
  await pool.execute(
    `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
    updateParams
  );

  // Log update
  logger.logAudit(req.user.id, 'USER_UPDATED', 'users', userId, {
    updatedFields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    message: 'User updated successfully'
  });
}));

// Assign role to user
router.post('/:id/roles', checkPermission('users', 'update'), validateRoleAssignment, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const userId = parseInt(req.params.id);
  const { roleId, expiresAt } = req.body;

  // Check if user exists
  const [users] = await pool.execute(
    'SELECT id FROM users WHERE id = ?',
    [userId]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Check if role exists
  const [roles] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = ? AND is_active = TRUE',
    [roleId]
  );

  if (roles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Check if role is already assigned
  const [existingAssignments] = await pool.execute(
    'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  );

  if (existingAssignments.length > 0) {
    return res.status(400).json({
      error: 'Role already assigned to user',
      code: 'ROLE_ALREADY_ASSIGNED'
    });
  }

  // Assign role
  await pool.execute(
    'INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at) VALUES (?, ?, ?, ?)',
    [userId, roleId, req.user.id, expiresAt || null]
  );

  // Log role assignment
  logger.logAudit(req.user.id, 'ROLE_ASSIGNED', 'user_roles', userId, {
    roleId,
    roleName: roles[0].name,
    expiresAt,
    ip: req.ip
  });

  res.status(201).json({
    message: 'Role assigned successfully'
  });
}));

// Remove role from user
router.delete('/:id/roles/:roleId', checkPermission('users', 'update'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const roleId = parseInt(req.params.roleId);

  // Check if assignment exists
  const [assignments] = await pool.execute(
    'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  );

  if (assignments.length === 0) {
    return res.status(404).json({
      error: 'Role assignment not found',
      code: 'ASSIGNMENT_NOT_FOUND'
    });
  }

  // Remove role assignment
  await pool.execute(
    'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  );

  // Log role removal
  logger.logAudit(req.user.id, 'ROLE_REMOVED', 'user_roles', userId, {
    roleId,
    ip: req.ip
  });

  res.json({
    message: 'Role removed successfully'
  });
}));

// Get user roles
router.get('/:id/roles', checkPermission('users', 'read'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const [roles] = await pool.execute(`
    SELECT r.id, r.name, r.description, ur.assigned_at, ur.expires_at, ur.assigned_by
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE
    ORDER BY ur.assigned_at DESC
  `, [userId]);

  res.json({ roles });
}));

// Deactivate user
router.patch('/:id/deactivate', requireAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  // Check if user exists
  const [users] = await pool.execute(
    'SELECT id, username FROM users WHERE id = ?',
    [userId]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Prevent deactivating own account
  if (userId === req.user.id) {
    return res.status(400).json({
      error: 'Cannot deactivate your own account',
      code: 'SELF_DEACTIVATION'
    });
  }

  // Deactivate user
  await pool.execute(
    'UPDATE users SET is_active = FALSE WHERE id = ?',
    [userId]
  );

  // Log deactivation
  logger.logAudit(req.user.id, 'USER_DEACTIVATED', 'users', userId, {
    deactivatedUser: users[0].username,
    ip: req.ip
  });

  res.json({
    message: 'User deactivated successfully'
  });
}));

// Activate user
router.patch('/:id/activate', requireAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  // Check if user exists
  const [users] = await pool.execute(
    'SELECT id, username FROM users WHERE id = ?',
    [userId]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Activate user
  await pool.execute(
    'UPDATE users SET is_active = TRUE WHERE id = ?',
    [userId]
  );

  // Log activation
  logger.logAudit(req.user.id, 'USER_ACTIVATED', 'users', userId, {
    activatedUser: users[0].username,
    ip: req.ip
  });

  res.json({
    message: 'User activated successfully'
  });
}));

// Delete user (admin only)
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  // Check if user exists
  const [users] = await pool.execute(
    'SELECT id, username FROM users WHERE id = ?',
    [userId]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Prevent deleting own account
  if (userId === req.user.id) {
    return res.status(400).json({
      error: 'Cannot delete your own account',
      code: 'SELF_DELETION'
    });
  }

  // Delete user (cascade will handle related records)
  await pool.execute(
    'DELETE FROM users WHERE id = ?',
    [userId]
  );

  // Log deletion
  logger.logAudit(req.user.id, 'USER_DELETED', 'users', userId, {
    deletedUser: users[0].username,
    ip: req.ip
  });

  res.json({
    message: 'User deleted successfully'
  });
}));

module.exports = router;

