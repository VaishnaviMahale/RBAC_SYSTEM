const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

// JWT token verification middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const [users] = await pool.execute(
      'SELECT id, username, email, first_name, last_name, is_active, is_verified FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ 
        error: 'Invalid or inactive user',
        code: 'USER_INVALID'
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    
    logger.error('Authentication error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Check if user has specific permission
const checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Get user's permissions through roles
      const [permissions] = await pool.execute(`
        SELECT DISTINCT p.name, p.resource, p.action
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? 
        AND ur.is_active = TRUE
        AND rp.is_active = TRUE
        AND p.is_active = TRUE
        AND p.resource = ?
        AND p.action = ?
      `, [req.user.id, resource, action]);

      if (permissions.length === 0) {
        logger.logSecurityEvent('Permission Denied', {
          userId: req.user.id,
          resource,
          action,
          ip: req.ip
        });
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: { resource, action }
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({ 
        error: 'Permission verification failed',
        code: 'PERMISSION_ERROR'
      });
    }
  };
};

// Check if user has any of the specified permissions
const checkAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const permissionConditions = permissions.map(p => 
        `(p.resource = ? AND p.action = ?)`
      ).join(' OR ');

      const [userPermissions] = await pool.execute(`
        SELECT DISTINCT p.name, p.resource, p.action
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? 
        AND ur.is_active = TRUE
        AND rp.is_active = TRUE
        AND p.is_active = TRUE
        AND (${permissionConditions})
      `, [req.user.id, ...permissions.flatMap(p => [p.resource, p.action])]);

      if (userPermissions.length === 0) {
        logger.logSecurityEvent('Permission Denied', {
          userId: req.user.id,
          requiredPermissions: permissions,
          ip: req.ip
        });
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: permissions
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({ 
        error: 'Permission verification failed',
        code: 'PERMISSION_ERROR'
      });
    }
  };
};

// Check if user has specific role
const checkRole = (roleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const [roles] = await pool.execute(`
        SELECT r.name
        FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ? 
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
        AND r.name = ?
      `, [req.user.id, roleName]);

      if (roles.length === 0) {
        logger.logSecurityEvent('Role Check Failed', {
          userId: req.user.id,
          requiredRole: roleName,
          ip: req.ip
        });
        
        return res.status(403).json({ 
          error: 'Insufficient role privileges',
          code: 'ROLE_DENIED',
          required: roleName
        });
      }

      next();
    } catch (error) {
      logger.error('Role check error:', error);
      return res.status(500).json({ 
        error: 'Role verification failed',
        code: 'ROLE_ERROR'
      });
    }
  };
};

// Check if user has any of the specified roles
const checkAnyRole = (roleNames) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const [roles] = await pool.execute(`
        SELECT r.name
        FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ? 
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
        AND r.name IN (${roleNames.map(() => '?').join(',')})
      `, [req.user.id, ...roleNames]);

      if (roles.length === 0) {
        logger.logSecurityEvent('Role Check Failed', {
          userId: req.user.id,
          requiredRoles: roleNames,
          ip: req.ip
        });
        
        return res.status(403).json({ 
          error: 'Insufficient role privileges',
          code: 'ROLE_DENIED',
          required: roleNames
        });
      }

      next();
    } catch (error) {
      logger.error('Role check error:', error);
      return res.status(500).json({ 
        error: 'Role verification failed',
        code: 'ROLE_ERROR'
      });
    }
  };
};

// Admin role check (common pattern)
const requireAdmin = checkRole('admin');

// Super admin role check
const requireSuperAdmin = checkRole('super_admin');

module.exports = {
  authenticateToken,
  checkPermission,
  checkAnyPermission,
  checkRole,
  checkAnyRole,
  requireAdmin,
  requireSuperAdmin
};

