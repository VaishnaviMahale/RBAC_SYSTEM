import React from 'react';
import { useQuery } from 'react-query';
import {
  Users,
  Shield,
  Key,
  FileText,
  TrendingUp,
  Activity,
  Clock,
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { usersAPI, rolesAPI, permissionsAPI, auditAPI } from '../services/api';

const Dashboard = () => {
  const { user } = useAuth();

  const navigate = useNavigate();

  const handleAddUser = () => navigate('/users');
  const handleCreateRole = () => navigate('/roles');
  const handleAddPermission = () => navigate('/permissions');
  const handleViewReports = () => navigate('/audit');
  const handleRequestRole = () => navigate('/request-role');

  // Fetch dashboard data
  const { data: usersData } = useQuery(['users', 'dashboard'], () =>
    usersAPI.getAll({ limit: 5, page: 1 })
  );

  const { data: rolesData } = useQuery(['roles', 'dashboard'], () =>
    rolesAPI.getAll({ limit: 5, page: 1 })
  );

  const { data: permissionsData } = useQuery(['permissions', 'dashboard'], () =>
    permissionsAPI.getAll({ limit: 5, page: 1 })
  );

  const { data: auditData } = useQuery(['audit', 'recent'], () =>
    auditAPI.getRecent({ limit: 10 })
  );

  const { data: auditStats } = useQuery(['audit', 'stats'], () =>
    auditAPI.getStats()
  );

  // Mock data for charts (replace with real data from API)
  const activityData = [
    { name: 'Mon', users: 4, roles: 2, permissions: 8 },
    { name: 'Tue', users: 3, roles: 1, permissions: 5 },
    { name: 'Wed', users: 6, roles: 3, permissions: 12 },
    { name: 'Thu', users: 2, roles: 1, permissions: 3 },
    { name: 'Fri', users: 5, roles: 2, permissions: 7 },
    { name: 'Sat', users: 1, roles: 0, permissions: 2 },
    { name: 'Sun', users: 3, roles: 1, permissions: 4 },
  ];

  const roleDistribution = [
    { name: 'Admin', value: 15, color: '#3B82F6' },
    { name: 'Manager', value: 25, color: '#10B981' },
    { name: 'User', value: 45, color: '#F59E0B' },
    { name: 'Guest', value: 15, color: '#6B7280' },
  ];

  const stats = [
    {
      name: 'Total Users',
      value: usersData?.users?.length || 0,
      icon: Users,
      change: '+12%',
      changeType: 'positive',
      color: 'bg-blue-500',
    },
    {
      name: 'Active Roles',
      value: rolesData?.roles?.length || 0,
      icon: Shield,
      change: '+5%',
      changeType: 'positive',
      color: 'bg-green-500',
    },
    {
      name: 'Permissions',
      value: permissionsData?.permissions?.length || 0,
      icon: Key,
      change: '+8%',
      changeType: 'positive',
      color: 'bg-purple-500',
    },
    {
      name: 'Audit Events',
      value: auditStats?.totalStats?.total_actions || 0,
      icon: FileText,
      change: '+15%',
      changeType: 'positive',
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.first_name || user?.username}!
        </h1>
        <p className="text-gray-600 mt-2">
          Here's what's happening with your RBAC system today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
            <div className="mt-4">
              <span className={`text-sm font-medium ${stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                }`}>
                {stat.change}
              </span>
              <span className="text-sm text-gray-600 ml-1">from last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Weekly Activity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="users" fill="#3B82F6" name="Users" />
              <Bar dataKey="roles" fill="#10B981" name="Roles" />
              <Bar dataKey="permissions" fill="#F59E0B" name="Permissions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Role Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Role Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={roleDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {roleDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View all
            </button>
          </div>
          <div className="space-y-4">
            {auditData?.recentLogs?.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <Activity className="h-4 w-4 text-primary-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{log.username || 'System'}</span>{' '}
                    {log.action.toLowerCase().replace('_', ' ')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button onClick={handleRequestRole} className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500">
              <Shield className="h-4 w-4 mr-2" />
              Request User Role
            </button>
            <button onClick={handleAddUser} className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
              <Users className="h-4 w-4 mr-2" />
              Add User
            </button>
            <button onClick={handleCreateRole} className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
              <Shield className="h-4 w-4 mr-2" />
              Create Role
            </button>
            <button onClick={handleAddPermission} className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
              <Key className="h-4 w-4 mr-2" />
              Add Permission
            </button>
            <button onClick={handleViewReports} className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
              <FileText className="h-4 w-4 mr-2" />
              View Reports
            </button>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center p-4 bg-green-50 rounded-lg">
            <div className="flex-shrink-0">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">Authentication</p>
              <p className="text-sm text-green-600">All systems operational</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-blue-50 rounded-lg">
            <div className="flex-shrink-0">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-800">Uptime</p>
              <p className="text-sm text-blue-600">99.9% (Last 30 days)</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-yellow-50 rounded-lg">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-800">Alerts</p>
              <p className="text-sm text-yellow-600">2 low priority alerts</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

