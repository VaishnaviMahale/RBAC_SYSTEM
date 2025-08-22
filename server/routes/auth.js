const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateRegistration = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
];

const validateLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// User registration
router.post('/register', validateRegistration, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { username, email, password, firstName, lastName } = req.body;

  // Check if user already exists
  const [existingUsers] = await pool.execute(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    [username, email]
  );

  if (existingUsers.length > 0) {
    return res.status(400).json({
      error: 'User already exists',
      code: 'USER_EXISTS'
    });
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
    [username, email, passwordHash, firstName || null, lastName || null]
  );

  // Get created user (without password)
  const [users] = await pool.execute(
    'SELECT id, username, email, first_name, last_name, is_active, is_verified, created_at FROM users WHERE id = ?',
    [result.insertId]
  );

  // Log registration
  logger.logAudit(result.insertId, 'USER_REGISTERED', 'users', result.insertId, {
    username,
    email,
    ip: req.ip
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: users[0]
  });
}));

// User login
router.post('/login', validateLogin, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { username, password } = req.body;

  // Get user with password hash
  const [users] = await pool.execute(
    'SELECT id, username, email, password_hash, first_name, last_name, is_active, is_verified FROM users WHERE username = ? OR email = ?',
    [username, username]
  );

  if (users.length === 0) {
    logger.logSecurityEvent('Login Failed - User Not Found', {
      username,
      ip: req.ip
    });
    
    return res.status(401).json({
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS'
    });
  }

  const user = users[0];

  // Check if user is active
  if (!user.is_active) {
    logger.logSecurityEvent('Login Failed - Inactive User', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    });
    
    return res.status(401).json({
      error: 'Account is deactivated',
      code: 'ACCOUNT_DEACTIVATED'
    });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    logger.logSecurityEvent('Login Failed - Invalid Password', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    });
    
    return res.status(401).json({
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS'
    });
  }

  // Update last login
  await pool.execute(
    'UPDATE users SET last_login = NOW() WHERE id = ?',
    [user.id]
  );

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  // Get user roles and permissions
  const [roles] = await pool.execute(`
    SELECT r.id, r.name, r.description
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE
  `, [user.id]);

  const [permissions] = await pool.execute(`
    SELECT DISTINCT p.name, p.resource, p.action
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN user_roles ur ON rp.role_id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND rp.is_active = TRUE AND p.is_active = TRUE
  `, [user.id]);

  // Log successful login
  logger.logAudit(user.id, 'USER_LOGIN', 'users', user.id, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Remove password hash from response
  delete user.password_hash;

  res.json({
    message: 'Login successful',
    token,
    user: {
      ...user,
      roles: roles.map(r => ({ id: r.id, name: r.name, description: r.description })),
      permissions: permissions.map(p => ({ name: p.name, resource: p.resource, action: p.action }))
    }
  });
}));

// Get current user profile
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const [users] = await pool.execute(
    'SELECT id, username, email, first_name, last_name, is_active, is_verified, last_login, created_at FROM users WHERE id = ?',
    [req.user.id]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Get user roles and permissions
  const [roles] = await pool.execute(`
    SELECT r.id, r.name, r.description
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE
  `, [req.user.id]);

  const [permissions] = await pool.execute(`
    SELECT DISTINCT p.name, p.resource, p.action
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN user_roles ur ON rp.role_id = ur.role_id
    WHERE ur.user_id = ? AND ur.is_active = TRUE AND rp.is_active = TRUE AND p.is_active = TRUE
  `, [req.user.id]);

  res.json({
    user: {
      ...users[0],
      roles: roles.map(r => ({ id: r.id, name: r.name, description: r.description })),
      permissions: permissions.map(p => ({ name: p.name, resource: p.resource, action: p.action }))
    }
  });
}));

// Refresh token
router.post('/refresh', authenticateToken, asyncHandler(async (req, res) => {
  // Generate new token
  const token = jwt.sign(
    { userId: req.user.id, username: req.user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({
    message: 'Token refreshed successfully',
    token
  });
}));

// Logout (client-side token removal, but log the action)
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  // Log logout
  logger.logAudit(req.user.id, 'USER_LOGOUT', 'users', req.user.id, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.json({
    message: 'Logout successful'
  });
}));

// Change password
router.post('/change-password', authenticateToken, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;

  // Get current password hash
  const [users] = await pool.execute(
    'SELECT password_hash FROM users WHERE id = ?',
    [req.user.id]
  );

  if (users.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, users[0].password_hash);
  if (!isCurrentPasswordValid) {
    logger.logSecurityEvent('Password Change Failed - Invalid Current Password', {
      userId: req.user.id,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: 'Current password is incorrect',
      code: 'INVALID_CURRENT_PASSWORD'
    });
  }

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await pool.execute(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [newPasswordHash, req.user.id]
  );

  // Log password change
  logger.logAudit(req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, {
    ip: req.ip
  });

  res.json({
    message: 'Password changed successfully'
  });
}));

module.exports = router;

