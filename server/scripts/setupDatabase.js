const { pool, initializeDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');
const { logger } = require('../utils/logger');

// Default roles
const defaultRoles = [
  {
    name: 'super_admin',
    description: 'Super Administrator with full system access'
  },
  {
    name: 'admin',
    description: 'Administrator with management privileges'
  },
  {
    name: 'manager',
    description: 'Manager with limited administrative access'
  },
  {
    name: 'user',
    description: 'Standard user with basic access'
  },
  {
    name: 'guest',
    description: 'Guest user with read-only access'
  }
];

// Default permissions
const defaultPermissions = [
  // User management
  { name: 'users:read', description: 'Read user information', resource: 'users', action: 'read' },
  { name: 'users:create', description: 'Create new users', resource: 'users', action: 'create' },
  { name: 'users:update', description: 'Update user information', resource: 'users', action: 'update' },
  { name: 'users:delete', description: 'Delete users', resource: 'users', action: 'delete' },
  { name: 'users:activate', description: 'Activate/deactivate users', resource: 'users', action: 'activate' },

  // Role management
  { name: 'roles:read', description: 'Read role information', resource: 'roles', action: 'read' },
  { name: 'roles:create', description: 'Create new roles', resource: 'roles', action: 'create' },
  { name: 'roles:update', description: 'Update role information', resource: 'roles', action: 'update' },
  { name: 'roles:delete', description: 'Delete roles', resource: 'roles', action: 'delete' },
  { name: 'roles:assign', description: 'Assign roles to users', resource: 'roles', action: 'assign' },

  // Permission management
  { name: 'permissions:read', description: 'Read permission information', resource: 'permissions', action: 'read' },
  { name: 'permissions:create', description: 'Create new permissions', resource: 'permissions', action: 'create' },
  { name: 'permissions:update', description: 'Update permission information', resource: 'permissions', action: 'update' },
  { name: 'permissions:delete', description: 'Delete permissions', resource: 'permissions', action: 'delete' },
  { name: 'permissions:assign', description: 'Assign permissions to roles', resource: 'permissions', action: 'assign' },

  // Audit management
  { name: 'audit:read', description: 'Read audit logs', resource: 'audit', action: 'read' },
  { name: 'audit:export', description: 'Export audit logs', resource: 'audit', action: 'export' },

  // System management
  { name: 'system:read', description: 'Read system information', resource: 'system', action: 'read' },
  { name: 'system:update', description: 'Update system settings', resource: 'system', action: 'update' },

  // Profile management
  { name: 'profile:read', description: 'Read own profile', resource: 'profile', action: 'read' },
  { name: 'profile:update', description: 'Update own profile', resource: 'profile', action: 'update' },
  { name: 'profile:password', description: 'Change own password', resource: 'profile', action: 'password' }
];

// Role-permission mappings
const rolePermissions = {
  'super_admin': [
    'users:read', 'users:create', 'users:update', 'users:delete', 'users:activate',
    'roles:read', 'roles:create', 'roles:update', 'roles:delete', 'roles:assign',
    'permissions:read', 'permissions:create', 'permissions:update', 'permissions:delete', 'permissions:assign',
    'audit:read', 'audit:export',
    'system:read', 'system:update',
    'profile:read', 'profile:update', 'profile:password'
  ],
  'admin': [
    'users:read', 'users:create', 'users:update', 'users:activate',
    'roles:read', 'roles:create', 'roles:update', 'roles:assign',
    'permissions:read', 'permissions:read',
    'audit:read', 'audit:export',
    'system:read',
    'profile:read', 'profile:update', 'profile:password'
  ],
  'manager': [
    'users:read', 'users:update',
    'roles:read',
    'permissions:read',
    'audit:read',
    'profile:read', 'profile:update', 'profile:password'
  ],
  'user': [
    'profile:read', 'profile:update', 'profile:password'
  ],
  'guest': [
    'profile:read'
  ]
};

// Setup function
async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');

    // Initialize database tables
    await initializeDatabase();

    // Create default roles
    console.log('📝 Creating default roles...');
    for (const role of defaultRoles) {
      const [existingRoles] = await pool.execute(
        'SELECT id FROM roles WHERE name = ?',
        [role.name]
      );

      if (existingRoles.length === 0) {
        await pool.execute(
          'INSERT INTO roles (name, description) VALUES (?, ?)',
          [role.name, role.description]
        );
        console.log(`✅ Created role: ${role.name}`);
      } else {
        console.log(`ℹ️  Role already exists: ${role.name}`);
      }
    }

    // Create default permissions
    console.log('🔐 Creating default permissions...');
    for (const permission of defaultPermissions) {
      const [existingPermissions] = await pool.execute(
        'SELECT id FROM permissions WHERE name = ?',
        [permission.name]
      );

      if (existingPermissions.length === 0) {
        await pool.execute(
          'INSERT INTO permissions (name, description, resource, action) VALUES (?, ?, ?, ?)',
          [permission.name, permission.description, permission.resource, permission.action]
        );
        console.log(`✅ Created permission: ${permission.name}`);
      } else {
        console.log(`ℹ️  Permission already exists: ${permission.name}`);
      }
    }

    // Assign permissions to roles
    console.log('🔗 Assigning permissions to roles...');
    for (const [roleName, permissionNames] of Object.entries(rolePermissions)) {
      // Get role ID
      const [roles] = await pool.execute(
        'SELECT id FROM roles WHERE name = ?',
        [roleName]
      );

      if (roles.length === 0) {
        console.log(`⚠️  Role not found: ${roleName}`);
        continue;
      }

      const roleId = roles[0].id;

      for (const permissionName of permissionNames) {
        // Get permission ID
        const [permissions] = await pool.execute(
          'SELECT id FROM permissions WHERE name = ?',
          [permissionName]
        );

        if (permissions.length === 0) {
          console.log(`⚠️  Permission not found: ${permissionName}`);
          continue;
        }

        const permissionId = permissions[0].id;

        // Check if assignment already exists
        const [existingAssignments] = await pool.execute(
          'SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ?',
          [roleId, permissionId]
        );

        if (existingAssignments.length === 0) {
          await pool.execute(
            'INSERT INTO role_permissions (role_id, permission_id, granted_by) VALUES (?, ?, NULL)',
            [roleId, permissionId]
          );
          console.log(`✅ Assigned ${permissionName} to ${roleName}`);
        } else {
          console.log(`ℹ️  Permission already assigned: ${permissionName} to ${roleName}`);
        }
      }
    }

    // Create default admin user
    console.log('👤 Creating default admin user...');
    const adminUsername = 'admin';
    const adminEmail = 'admin@rbac-system.com';
    const adminPassword = 'Admin@123';

    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [adminUsername, adminEmail]
    );

    if (existingUsers.length === 0) {
      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

      // Create admin user
      const [result] = await pool.execute(
        'INSERT INTO users (username, email, password_hash, first_name, last_name, is_active, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [adminUsername, adminEmail, passwordHash, 'System', 'Administrator', true, true]
      );

      // Get admin role ID
      const [adminRoles] = await pool.execute(
        'SELECT id FROM roles WHERE name = ?',
        ['super_admin']
      );

      if (adminRoles.length > 0) {
        // Assign super_admin role to admin user
        await pool.execute(
          'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)',
          [result.insertId, adminRoles[0].id]
        );
      }

      console.log('✅ Created default admin user:');
      console.log(`   Username: ${adminUsername}`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log('   ⚠️  Please change this password after first login!');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    console.log('🎉 Database setup completed successfully!');
    console.log('\n📋 Default credentials:');
    console.log('   Username: admin');
    console.log('   Password: Admin@123');
    console.log('   Email: admin@rbac-system.com');
    console.log('\n🔐 Default roles created:');
    defaultRoles.forEach(role => console.log(`   - ${role.name}: ${role.description}`));

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };

