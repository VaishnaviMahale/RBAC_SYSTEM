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
const validateRole = [
  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Role name can only contain letters, numbers, and underscores'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
];

const validatePermissionAssignment = [
  body('permissionId')
    .isInt({ min: 1 })
    .withMessage('Permission ID must be a positive integer'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date')
];

// Get all roles
router.get('/', checkPermission('roles', 'read'), [
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
  const statusFilter = req.query.status || 'all';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (search) {
    whereClause += ' AND (r.name LIKE ? OR r.description LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (statusFilter !== 'all') {
    whereClause += ' AND r.is_active = ?';
    params.push(statusFilter === 'active');
  }

  // Get total count
  const [countResult] = await pool.execute(`
    SELECT COUNT(*) as total FROM roles r ${whereClause}
  `, params);

  const total = countResult[0].total;

  // Get roles with pagination
  const [roles] = await pool.execute(`
    SELECT id, name, description, is_active, created_at, updated_at
    FROM roles r
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Get permission count for each role
  for (let role of roles) {
    const [permissionCount] = await pool.execute(`
      SELECT COUNT(*) as count
      FROM role_permissions rp
      WHERE rp.role_id = ? AND rp.is_active = TRUE
    `, [role.id]);
    role.permissionCount = permissionCount[0].count;

    // Get user count for each role
    const [userCount] = await pool.execute(`
      SELECT COUNT(*) as count
      FROM user_roles ur
      WHERE ur.role_id = ? AND ur.is_active = TRUE
    `, [role.id]);
    role.userCount = userCount[0].count;
  }

  res.json({
    roles,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get role by ID
router.get('/:id', checkPermission('roles', 'read'), asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);

  const [roles] = await pool.execute(`
    SELECT id, name, description, is_active, created_at, updated_at
    FROM roles WHERE id = ?
  `, [roleId]);

  if (roles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Get role permissions
  const [permissions] = await pool.execute(`
    SELECT p.id, p.name, p.description, p.resource, p.action, rp.granted_at, rp.expires_at
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ? AND rp.is_active = TRUE AND p.is_active = TRUE
    ORDER BY p.resource, p.action
  `, [roleId]);

  // Get users with this role
  const [users] = await pool.execute(`
    SELECT u.id, u.username, u.email, u.first_name, u.last_name, ur.assigned_at, ur.expires_at
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role_id = ? AND ur.is_active = TRUE AND u.is_active = TRUE
    ORDER BY ur.assigned_at DESC
  `, [roleId]);

  const role = {
    ...roles[0],
    permissions,
    users
  };

  res.json({ role });
}));

// Create new role
router.post('/', requireAdmin, validateRole, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, description } = req.body;

  // Check if role already exists
  const [existingRoles] = await pool.execute(
    'SELECT id FROM roles WHERE name = ?',
    [name]
  );

  if (existingRoles.length > 0) {
    return res.status(400).json({
      error: 'Role already exists',
      code: 'ROLE_EXISTS'
    });
  }

  // Create role
  const [result] = await pool.execute(
    'INSERT INTO roles (name, description) VALUES (?, ?)',
    [name, description || null]
  );

  // Get created role
  const [roles] = await pool.execute(
    'SELECT id, name, description, is_active, created_at FROM roles WHERE id = ?',
    [result.insertId]
  );

  // Log role creation
  logger.logAudit(req.user.id, 'ROLE_CREATED', 'roles', result.insertId, {
    roleName: name,
    description,
    ip: req.ip
  });

  res.status(201).json({
    message: 'Role created successfully',
    role: roles[0]
  });
}));

// Request a role
router.post('/request', asyncHandler(async (req, res) => {
  const { role, reason } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }
  // Save request to a new table or log (for demo, just log)
  await pool.execute(
    'INSERT INTO role_requests (user_id, role, reason, status, requested_at) VALUES (?, ?, ?, ?, NOW())',
    [req.user.id, role, reason || '', 'pending']
  );
  logger.logAudit(req.user.id, 'ROLE_REQUESTED', 'role_requests', null, { role, reason });
  res.status(201).json({ message: 'Role request submitted!' });
}));

// Update role
router.put('/:id', requireAdmin, validateRole, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const roleId = parseInt(req.params.id);
  const { name, description } = req.body;

  // Check if role exists
  const [existingRoles] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = ?',
    [roleId]
  );

  if (existingRoles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Check if new name conflicts with existing role
  if (name && name !== existingRoles[0].name) {
    const [nameCheck] = await pool.execute(
      'SELECT id FROM roles WHERE name = ? AND id != ?',
      [name, roleId]
    );

    if (nameCheck.length > 0) {
      return res.status(400).json({
        error: 'Role name already exists',
        code: 'ROLE_NAME_EXISTS'
      });
    }
  }

  // Update role
  await pool.execute(
    'UPDATE roles SET name = ?, description = ? WHERE id = ?',
    [name, description || null, roleId]
  );

  // Log role update
  logger.logAudit(req.user.id, 'ROLE_UPDATED', 'roles', roleId, {
    oldName: existingRoles[0].name,
    newName: name,
    description,
    ip: req.ip
  });

  res.json({
    message: 'Role updated successfully'
  });
}));

// Assign permission to role
router.post('/:id/permissions', requireAdmin, validatePermissionAssignment, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const roleId = parseInt(req.params.id);
  const { permissionId, expiresAt } = req.body;

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

  // Check if permission exists
  const [permissions] = await pool.execute(
    'SELECT id, name FROM permissions WHERE id = ? AND is_active = TRUE',
    [permissionId]
  );

  if (permissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Check if permission is already assigned
  const [existingAssignments] = await pool.execute(
    'SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ?',
    [roleId, permissionId]
  );

  if (existingAssignments.length > 0) {
    return res.status(400).json({
      error: 'Permission already assigned to role',
      code: 'PERMISSION_ALREADY_ASSIGNED'
    });
  }

  // Assign permission
  await pool.execute(
    'INSERT INTO role_permissions (role_id, permission_id, granted_by, expires_at) VALUES (?, ?, ?, ?)',
    [roleId, permissionId, req.user.id, expiresAt || null]
  );

  // Log permission assignment
  logger.logAudit(req.user.id, 'PERMISSION_ASSIGNED', 'role_permissions', roleId, {
    roleId,
    roleName: roles[0].name,
    permissionId,
    permissionName: permissions[0].name,
    expiresAt,
    ip: req.ip
  });

  res.status(201).json({
    message: 'Permission assigned successfully'
  });
}));

// Remove permission from role
router.delete('/:id/permissions/:permissionId', requireAdmin, asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);
  const permissionId = parseInt(req.params.permissionId);

  // Check if assignment exists
  const [assignments] = await pool.execute(
    'SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ?',
    [roleId, permissionId]
  );

  if (assignments.length === 0) {
    return res.status(404).json({
      error: 'Permission assignment not found',
      code: 'ASSIGNMENT_NOT_FOUND'
    });
  }

  // Remove permission assignment
  await pool.execute(
    'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
    [roleId, permissionId]
  );

  // Log permission removal
  logger.logAudit(req.user.id, 'PERMISSION_REMOVED', 'role_permissions', roleId, {
    roleId,
    permissionId,
    ip: req.ip
  });

  res.json({
    message: 'Permission removed successfully'
  });
}));

// Get role permissions
router.get('/:id/permissions', checkPermission('roles', 'read'), asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);

  const [permissions] = await pool.execute(`
    SELECT p.id, p.name, p.description, p.resource, p.action, rp.granted_at, rp.expires_at
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ? AND rp.is_active = TRUE AND p.is_active = TRUE
    ORDER BY p.resource, p.action
  `, [roleId]);

  res.json({ permissions });
}));

// Deactivate role
router.patch('/:id/deactivate', requireAdmin, asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);

  // Check if role exists
  const [roles] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = ?',
    [roleId]
  );

  if (roles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Prevent deactivating system roles
  if (['admin', 'super_admin', 'user'].includes(roles[0].name)) {
    return res.status(400).json({
      error: 'Cannot deactivate system roles',
      code: 'SYSTEM_ROLE_PROTECTED'
    });
  }

  // Deactivate role
  await pool.execute(
    'UPDATE roles SET is_active = FALSE WHERE id = ?',
    [roleId]
  );

  // Log deactivation
  logger.logAudit(req.user.id, 'ROLE_DEACTIVATED', 'roles', roleId, {
    roleName: roles[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Role deactivated successfully'
  });
}));

// Activate role
router.patch('/:id/activate', requireAdmin, asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);

  // Check if role exists
  const [roles] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = ?',
    [roleId]
  );

  if (roles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Activate role
  await pool.execute(
    'UPDATE roles SET is_active = TRUE WHERE id = ?',
    [roleId]
  );

  // Log activation
  logger.logAudit(req.user.id, 'ROLE_ACTIVATED', 'roles', roleId, {
    roleName: roles[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Role activated successfully'
  });
}));

// Delete role (admin only)
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);

  // Check if role exists
  const [roles] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = ?',
    [roleId]
  );

  if (roles.length === 0) {
    return res.status(404).json({
      error: 'Role not found',
      code: 'ROLE_NOT_FOUND'
    });
  }

  // Prevent deleting system roles
  if (['admin', 'super_admin', 'user'].includes(roles[0].name)) {
    return res.status(400).json({
      error: 'Cannot delete system roles',
      code: 'SYSTEM_ROLE_PROTECTED'
    });
  }

  // Check if role is assigned to any users
  const [userAssignments] = await pool.execute(
    'SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?',
    [roleId]
  );

  if (userAssignments[0].count > 0) {
    return res.status(400).json({
      error: 'Cannot delete role - it is assigned to users',
      code: 'ROLE_IN_USE'
    });
  }

  // Delete role (cascade will handle related records)
  await pool.execute(
    'DELETE FROM roles WHERE id = ?',
    [roleId]
  );

  // Log deletion
  logger.logAudit(req.user.id, 'ROLE_DELETED', 'roles', roleId, {
    roleName: roles[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Role deleted successfully'
  });
}));

module.exports = router;

