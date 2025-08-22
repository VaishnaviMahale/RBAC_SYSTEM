# RBAC System - Role-Based Access Control

A comprehensive, secure Role-Based Access Control (RBAC) system built with React, Node.js, Express, and MySQL. This system provides granular user permissions, role management, audit logging, and a modern admin dashboard.

## 🚀 Features

### Core RBAC Features
- **User Management**: Complete user lifecycle management with secure authentication
- **Role Management**: Flexible role creation and assignment with hierarchical support
- **Permission Management**: Granular permissions with resource-action mapping
- **Access Control**: Middleware-based permission checking and role validation
- **Audit Logging**: Comprehensive activity tracking and compliance reporting

### Security Features
- **JWT Authentication**: Secure token-based authentication with refresh capabilities
- **Password Security**: Bcrypt hashing with configurable salt rounds
- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Comprehensive request validation and sanitization
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: HTTP security headers and protection

### Admin Dashboard
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **Real-time Data**: Live statistics and activity monitoring
- **Interactive Charts**: Visual data representation with Recharts
- **Responsive Design**: Mobile-first design approach
- **Permission-based UI**: Dynamic interface based on user permissions

### Database Features
- **Scalable Schema**: Optimized MySQL database with proper indexing
- **Connection Pooling**: Efficient database connection management
- **Foreign Key Constraints**: Data integrity and referential integrity
- **Audit Trail**: Complete audit logging for compliance

## 🏗️ Architecture

```
RBAC System/
├── server/                 # Backend API
│   ├── config/            # Database and configuration
│   ├── middleware/        # Authentication and validation
│   ├── routes/            # API endpoints
│   ├── scripts/           # Database setup and utilities
│   └── utils/             # Logging and utilities
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── pages/         # Application pages
│   │   └── services/      # API service layer
│   └── public/            # Static assets
└── docs/                  # Documentation
```

## 🛠️ Technology Stack

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **MySQL**: Relational database
- **JWT**: Authentication tokens
- **Bcrypt**: Password hashing
- **Winston**: Logging
- **Express Validator**: Input validation
- **Helmet**: Security middleware

### Frontend
- **React 18**: UI framework
- **React Router**: Client-side routing
- **React Query**: Data fetching and caching
- **Tailwind CSS**: Utility-first CSS framework
- **Recharts**: Chart components
- **Lucide React**: Icon library
- **React Hook Form**: Form management

## 📋 Prerequisites

- Node.js 16+ and npm
- MySQL 8.0+
- Git

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd RBAC
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install all dependencies (backend + frontend)
npm run install-all
```

### 3. Database Setup
```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE rbac_system;
exit;

# Copy environment file
cp server/env.example server/.env

# Edit environment variables
# Update DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET, etc.

# Setup database tables and initial data
npm run setup-db
```

### 4. Start Development Servers
```bash
# Start both backend and frontend
npm run dev

# Or start individually:
npm run server    # Backend on port 5000
npm run client    # Frontend on port 3000
```

### 5. Access the System
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Default Admin**: 
  - Username: `admin`
  - Password: `Admin@123`

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=rbac_system
DB_PORT=3306

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=5000
NODE_ENV=development

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=your_session_secret_here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📚 API Documentation

### Authentication Endpoints

#### POST /api/auth/register
Create a new user account
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### POST /api/auth/login
Authenticate user and get JWT token
```json
{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

#### GET /api/auth/profile
Get current user profile (requires authentication)

#### POST /api/auth/change-password
Change user password (requires authentication)
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass456!"
}
```

### User Management Endpoints

#### GET /api/users
Get all users (admin only, supports pagination and filtering)

#### GET /api/users/:id
Get user by ID (requires permission or own profile)

#### PUT /api/users/:id
Update user (requires permission)

#### POST /api/users/:id/roles
Assign role to user
```json
{
  "roleId": 1,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

#### DELETE /api/users/:id/roles/:roleId
Remove role from user

### Role Management Endpoints

#### GET /api/roles
Get all roles (supports pagination and filtering)

#### POST /api/roles
Create new role (admin only)
```json
{
  "name": "content_editor",
  "description": "Can edit content but not publish"
}
```

#### PUT /api/roles/:id
Update role (admin only)

#### POST /api/roles/:id/permissions
Assign permission to role
```json
{
  "permissionId": 1,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

### Permission Management Endpoints

#### GET /api/permissions
Get all permissions (supports pagination and filtering)

#### POST /api/permissions
Create new permission (admin only)
```json
{
  "name": "articles:edit",
  "description": "Edit article content",
  "resource": "articles",
  "action": "edit"
}
```

#### POST /api/permissions/bulk
Bulk create permissions (admin only)

### Audit Logging Endpoints

#### GET /api/audit
Get audit logs (admin only, supports filtering)

#### GET /api/audit/stats
Get audit statistics (admin only)

#### GET /api/audit/export
Export audit logs (admin only, CSV/JSON format)

## 🔐 Permission System

### Permission Format
Permissions follow the format: `resource:action`

**Examples:**
- `users:read` - Read user information
- `users:create` - Create new users
- `roles:update` - Update role information
- `permissions:delete` - Delete permissions

### Built-in Permissions
- **User Management**: `users:read`, `users:create`, `users:update`, `users:delete`
- **Role Management**: `roles:read`, `roles:create`, `roles:update`, `roles:delete`
- **Permission Management**: `permissions:read`, `permissions:create`, `permissions:update`, `permissions:delete`
- **Audit Management**: `audit:read`, `audit:export`
- **Profile Management**: `profile:read`, `profile:update`, `profile:password`

### Role Hierarchy
1. **Super Admin**: Full system access
2. **Admin**: User and role management
3. **Manager**: Limited administrative access
4. **User**: Basic access
5. **Guest**: Read-only access

## 🎨 Frontend Components

### Core Components
- **Layout**: Main application layout with sidebar navigation
- **ProtectedRoute**: Route protection based on authentication
- **Login**: Authentication page with registration support
- **Dashboard**: Main dashboard with statistics and charts

### UI Features
- **Responsive Design**: Mobile-first approach
- **Dark/Light Mode**: Theme switching capability
- **Loading States**: Skeleton loaders and spinners
- **Error Handling**: User-friendly error messages
- **Toast Notifications**: Success/error feedback

## 🧪 Testing

### Backend Testing
```bash
cd server
npm test
```

### Frontend Testing
```bash
cd client
npm test
```

### API Testing
Use tools like Postman or curl to test API endpoints:

```bash
# Test health endpoint
curl http://localhost:5000/api/health

# Test authentication
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'
```

## 🚀 Deployment

### Production Build
```bash
# Build frontend
cd client
npm run build

# Start production server
cd ../server
npm start
```

### Environment Variables
Set `NODE_ENV=production` and update all environment variables for production.

### Database
- Use production MySQL instance
- Configure proper backup strategies
- Set up monitoring and alerting

### Security Considerations
- Use strong JWT secrets
- Enable HTTPS
- Configure proper CORS origins
- Set up rate limiting
- Enable audit logging

## 📊 Monitoring and Logging

### Logging
- **Winston**: Structured logging with multiple transports
- **Audit Logs**: Complete activity tracking
- **Error Logging**: Detailed error information

### Metrics
- User activity tracking
- API usage statistics
- Performance monitoring
- Security event logging

## 🔒 Security Features

### Authentication
- JWT-based authentication
- Token refresh mechanism
- Secure password storage
- Session management

### Authorization
- Role-based access control
- Permission-based authorization
- Resource-level security
- Middleware protection

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints

## 🔮 Roadmap

### Future Features
- **Multi-tenancy**: Support for multiple organizations
- **2FA Support**: Two-factor authentication
- **SSO Integration**: Single sign-on capabilities
- **Advanced Analytics**: Enhanced reporting and insights
- **API Rate Limiting**: Per-user rate limiting
- **Webhook Support**: Event-driven integrations
- **Mobile App**: Native mobile application
- **Real-time Updates**: WebSocket support for live updates

---

**Built with ❤️ for secure, scalable access control systems**

