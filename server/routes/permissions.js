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
const validatePermission = [
  body('name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Permission name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Permission name can only contain letters, numbers, and underscores'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('resource')
    .isLength({ min: 2, max: 50 })
    .withMessage('Resource must be between 2 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Resource can only contain letters, numbers, and underscores'),
  body('action')
    .isLength({ min: 2, max: 50 })
    .withMessage('Action must be between 2 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Action can only contain letters, numbers, and underscores')
];

// Get all permissions
router.get('/', checkPermission('permissions', 'read'), [
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
  query('resource')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Resource filter must be between 1 and 50 characters'),
  query('action')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Action filter must be between 1 and 50 characters'),
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
  const resourceFilter = req.query.resource || '';
  const actionFilter = req.query.action || '';
  const statusFilter = req.query.status || 'all';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (search) {
    whereClause += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (resourceFilter) {
    whereClause += ' AND p.resource = ?';
    params.push(resourceFilter);
  }

  if (actionFilter) {
    whereClause += ' AND p.action = ?';
    params.push(actionFilter);
  }

  if (statusFilter !== 'all') {
    whereClause += ' AND p.is_active = ?';
    params.push(statusFilter === 'active');
  }

  // Get total count
  const [countResult] = await pool.execute(`
    SELECT COUNT(*) as total FROM permissions p ${whereClause}
  `, params);

  const total = countResult[0].total;

  // Get permissions with pagination
  const [permissions] = await pool.execute(`
    SELECT id, name, description, resource, action, is_active, created_at, updated_at
    FROM permissions p
    ${whereClause}
    ORDER BY p.resource, p.action, p.name
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Get role count for each permission
  for (let permission of permissions) {
    const [roleCount] = await pool.execute(`
      SELECT COUNT(*) as count
      FROM role_permissions rp
      WHERE rp.permission_id = ? AND rp.is_active = TRUE
    `, [permission.id]);
    permission.roleCount = roleCount[0].count;
  }

  res.json({
    permissions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get permission by ID
router.get('/:id', checkPermission('permissions', 'read'), asyncHandler(async (req, res) => {
  const permissionId = parseInt(req.params.id);

  const [permissions] = await pool.execute(`
    SELECT id, name, description, resource, action, is_active, created_at, updated_at
    FROM permissions WHERE id = ?
  `, [permissionId]);

  if (permissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Get roles that have this permission
  const [roles] = await pool.execute(`
    SELECT r.id, r.name, r.description, rp.granted_at, rp.expires_at
    FROM roles r
    JOIN role_permissions rp ON r.id = rp.role_id
    WHERE rp.permission_id = ? AND rp.is_active = TRUE AND r.is_active = TRUE
    ORDER BY r.name
  `, [permissionId]);

  const permission = {
    ...permissions[0],
    roles
  };

  res.json({ permission });
}));

// Create new permission
router.post('/', requireAdmin, validatePermission, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, description, resource, action } = req.body;

  // Check if permission already exists
  const [existingPermissions] = await pool.execute(
    'SELECT id FROM permissions WHERE name = ? OR (resource = ? AND action = ?)',
    [name, resource, action]
  );

  if (existingPermissions.length > 0) {
    return res.status(400).json({
      error: 'Permission already exists',
      code: 'PERMISSION_EXISTS'
    });
  }

  // Create permission
  const [result] = await pool.execute(
    'INSERT INTO permissions (name, description, resource, action) VALUES (?, ?, ?, ?)',
    [name, description || null, resource, action]
  );

  // Get created permission
  const [permissions] = await pool.execute(
    'SELECT id, name, description, resource, action, is_active, created_at FROM permissions WHERE id = ?',
    [result.insertId]
  );

  // Log permission creation
  logger.logAudit(req.user.id, 'PERMISSION_CREATED', 'permissions', result.insertId, {
    permissionName: name,
    resource,
    action,
    description,
    ip: req.ip
  });

  res.status(201).json({
    message: 'Permission created successfully',
    permission: permissions[0]
  });
}));

// Update permission
router.put('/:id', requireAdmin, validatePermission, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const permissionId = parseInt(req.params.id);
  const { name, description, resource, action } = req.body;

  // Check if permission exists
  const [existingPermissions] = await pool.execute(
    'SELECT id, name, resource, action FROM permissions WHERE id = ?',
    [permissionId]
  );

  if (existingPermissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Check if new name or resource/action combination conflicts with existing permission
  if (name !== existingPermissions[0].name ||
    resource !== existingPermissions[0].resource ||
    action !== existingPermissions[0].action) {

    const [conflictCheck] = await pool.execute(
      'SELECT id FROM permissions WHERE (name = ? OR (resource = ? AND action = ?)) AND id != ?',
      [name, resource, action, permissionId]
    );

    if (conflictCheck.length > 0) {
      return res.status(400).json({
        error: 'Permission name or resource/action combination already exists',
        code: 'PERMISSION_CONFLICT'
      });
    }
  }

  // Update permission
  await pool.execute(
    'UPDATE permissions SET name = ?, description = ?, resource = ?, action = ? WHERE id = ?',
    [name, description || null, resource, action, permissionId]
  );

  // Log permission update
  logger.logAudit(req.user.id, 'PERMISSION_UPDATED', 'permissions', permissionId, {
    oldName: existingPermissions[0].name,
    newName: name,
    oldResource: existingPermissions[0].resource,
    newResource: resource,
    oldAction: existingPermissions[0].action,
    newAction: action,
    description,
    ip: req.ip
  });

  res.json({
    message: 'Permission updated successfully'
  });
}));

// Deactivate permission
router.patch('/:id/deactivate', requireAdmin, asyncHandler(async (req, res) => {
  const permissionId = parseInt(req.params.id);

  // Check if permission exists
  const [permissions] = await pool.execute(
    'SELECT id, name FROM permissions WHERE id = ?',
    [permissionId]
  );

  if (permissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Prevent deactivating system permissions
  if (['users:read', 'users:update', 'roles:read', 'permissions:read'].includes(permissions[0].name)) {
    return res.status(400).json({
      error: 'Cannot deactivate system permissions',
      code: 'SYSTEM_PERMISSION_PROTECTED'
    });
  }

  // Deactivate permission
  await pool.execute(
    'UPDATE permissions SET is_active = FALSE WHERE id = ?',
    [permissionId]
  );

  // Log deactivation
  logger.logAudit(req.user.id, 'PERMISSION_DEACTIVATED', 'permissions', permissionId, {
    permissionName: permissions[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Permission deactivated successfully'
  });
}));

// Activate permission
router.patch('/:id/activate', requireAdmin, asyncHandler(async (req, res) => {
  const permissionId = parseInt(req.params.id);

  // Check if permission exists
  const [permissions] = await pool.execute(
    'SELECT id, name FROM permissions WHERE id = ?',
    [permissionId]
  );

  if (permissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Activate permission
  await pool.execute(
    'UPDATE permissions SET is_active = TRUE WHERE id = ?',
    [permissionId]
  );

  // Log activation
  logger.logAudit(req.user.id, 'PERMISSION_ACTIVATED', 'permissions', permissionId, {
    permissionName: permissions[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Permission activated successfully'
  });
}));

// Delete permission (admin only)
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const permissionId = parseInt(req.params.id);

  // Check if permission exists
  const [permissions] = await pool.execute(
    'SELECT id, name FROM permissions WHERE id = ?',
    [permissionId]
  );

  if (permissions.length === 0) {
    return res.status(404).json({
      error: 'Permission not found',
      code: 'PERMISSION_NOT_FOUND'
    });
  }

  // Prevent deleting system permissions
  if (['users:read', 'users:update', 'roles:read', 'permissions:read'].includes(permissions[0].name)) {
    return res.status(400).json({
      error: 'Cannot delete system permissions',
      code: 'SYSTEM_PERMISSION_PROTECTED'
    });
  }

  // Check if permission is assigned to any roles
  const [roleAssignments] = await pool.execute(
    'SELECT COUNT(*) as count FROM role_permissions WHERE permission_id = ?',
    [permissionId]
  );

  if (roleAssignments[0].count > 0) {
    return res.status(400).json({
      error: 'Cannot delete permission - it is assigned to roles',
      code: 'PERMISSION_IN_USE'
    });
  }

  // Delete permission
  await pool.execute(
    'DELETE FROM permissions WHERE id = ?',
    [permissionId]
  );

  // Log deletion
  logger.logAudit(req.user.id, 'PERMISSION_DELETED', 'permissions', permissionId, {
    permissionName: permissions[0].name,
    ip: req.ip
  });

  res.json({
    message: 'Permission deleted successfully'
  });
}));

// Get available resources
router.get('/resources/list', checkPermission('permissions', 'read'), asyncHandler(async (req, res) => {
  const [resources] = await pool.execute(`
    SELECT DISTINCT resource, COUNT(*) as permission_count
    FROM permissions
    WHERE is_active = TRUE
    GROUP BY resource
    ORDER BY resource
  `);

  res.json({ resources });
}));

// Get available actions
router.get('/actions/list', checkPermission('permissions', 'read'), asyncHandler(async (req, res) => {
  const [actions] = await pool.execute(`
    SELECT DISTINCT action, COUNT(*) as permission_count
    FROM permissions
    WHERE is_active = TRUE
    GROUP BY action
    ORDER BY action
  `);

  res.json({ actions });
}));

// Bulk create permissions
router.post('/bulk', requireAdmin, [
  body('permissions')
    .isArray({ min: 1, max: 100 })
    .withMessage('Permissions must be an array with 1-100 items'),
  body('permissions.*.name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Permission name must be between 3 and 100 characters'),
  body('permissions.*.resource')
    .isLength({ min: 2, max: 50 })
    .withMessage('Resource must be between 2 and 50 characters'),
  body('permissions.*.action')
    .isLength({ min: 2, max: 50 })
    .withMessage('Action must be between 2 and 50 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { permissions } = req.body;
  const createdPermissions = [];
  const bulkErrors = [];

  for (let i = 0; i < permissions.length; i++) {
    const permission = permissions[i];

    try {
      // Check if permission already exists
      const [existingPermissions] = await pool.execute(
        'SELECT id FROM permissions WHERE name = ? OR (resource = ? AND action = ?)',
        [permission.name, permission.resource, permission.action]
      );

      if (existingPermissions.length > 0) {
        bulkErrors.push({
          index: i,
          error: 'Permission already exists',
          permission
        });
        continue;
      }

      // Create permission
      const [result] = await pool.execute(
        'INSERT INTO permissions (name, description, resource, action) VALUES (?, ?, ?, ?)',
        [permission.name, permission.description || null, permission.resource, permission.action]
      );

      // Get created permission
      const [newPermissions] = await pool.execute(
        'SELECT id, name, description, resource, action, is_active, created_at FROM permissions WHERE id = ?',
        [result.insertId]
      );

      createdPermissions.push(newPermissions[0]);

      // Log permission creation
      logger.logAudit(req.user.id, 'PERMISSION_CREATED', 'permissions', result.insertId, {
        permissionName: permission.name,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        ip: req.ip
      });

    } catch (error) {
      bulkErrors.push({
        index: i,
        error: error.message,
        permission
      });
    }
  }

  res.status(201).json({
    message: `Bulk permission creation completed. Created: ${createdPermissions.length}, Errors: ${errors.length}`,
    created: createdPermissions,
    errors: errors.length > 0 ? errors : undefined
  });
}));

module.exports = router;

