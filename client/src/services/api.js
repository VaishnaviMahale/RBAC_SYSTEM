import axios from 'axios';
import { toast } from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await axios.post(
            `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/refresh`,
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          const newToken = response.data.token;
          localStorage.setItem('token', newToken);
          api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle other errors
    if (error.response?.data?.error) {
      toast.error(error.response.data.error);
    } else if (error.message === 'Network Error') {
      toast.error('Network error. Please check your connection.');
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please try again.');
    } else {
      toast.error('An unexpected error occurred.');
    }

    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  login: (credentials) => api.post('/api/auth/login', credentials),
  register: (userData) => api.post('/api/auth/register', userData),
  logout: () => api.post('/api/auth/logout'),
  profile: () => api.get('/api/auth/profile'),
  changePassword: (passwordData) => api.post('/api/auth/change-password', passwordData),
  refreshToken: () => api.post('/api/auth/refresh'),
};

export const usersAPI = {
  getAll: (params) => api.get('/api/users', { params }),
  getById: (id) => api.get(`/api/users/${id}`),
  create: (userData) => api.post('/api/users', userData),
  update: (id, userData) => api.put(`/api/users/${id}`, userData),
  delete: (id) => api.delete(`/api/users/${id}`),
  activate: (id) => api.patch(`/api/users/${id}/activate`),
  deactivate: (id) => api.patch(`/api/users/${id}/deactivate`),
  assignRole: (id, roleData) => api.post(`/api/users/${id}/roles`, roleData),
  removeRole: (id, roleId) => api.delete(`/api/users/${id}/roles/${roleId}`),
  getRoles: (id) => api.get(`/api/users/${id}/roles`),
};

export const rolesAPI = {
  getAll: (params) => api.get('/api/roles', { params }),
  getById: (id) => api.get(`/api/roles/${id}`),
  create: (roleData) => api.post('/api/roles', roleData),
  update: (id, roleData) => api.put(`/api/roles/${id}`, roleData),
  delete: (id) => api.delete(`/api/roles/${id}`),
  activate: (id) => api.patch(`/api/roles/${id}/activate`),
  deactivate: (id) => api.patch(`/api/roles/${id}/deactivate`),
  assignPermission: (id, permissionData) => api.post(`/api/roles/${id}/permissions`, permissionData),
  removePermission: (id, permissionId) => api.delete(`/api/roles/${id}/permissions/${permissionId}`),
  getPermissions: (id) => api.get(`/api/roles/${id}/permissions`),
};

export const permissionsAPI = {
  getAll: (params) => api.get('/api/permissions', { params }),
  getById: (id) => api.get(`/api/permissions/${id}`),
  create: (permissionData) => api.post('/api/permissions', permissionData),
  update: (id, permissionData) => api.put(`/api/permissions/${id}`, permissionData),
  delete: (id) => api.delete(`/api/permissions/${id}`),
  activate: (id) => api.patch(`/api/permissions/${id}/activate`),
  deactivate: (id) => api.patch(`/api/permissions/${id}/deactivate`),
  bulkCreate: (permissionsData) => api.post('/api/permissions/bulk', permissionsData),
  getResources: () => api.get('/api/permissions/resources/list'),
  getActions: () => api.get('/api/permissions/actions/list'),
};

export const auditAPI = {
  getAll: (params) => api.get('/api/audit', { params }),
  getByUser: (userId, params) => api.get(`/api/audit/user/${userId}`, { params }),
  getByResource: (resourceType, resourceId, params) => 
    api.get(`/api/audit/resource/${resourceType}/${resourceId}`, { params }),
  getStats: (params) => api.get('/api/audit/stats', { params }),
  export: (params) => api.get('/api/audit/export', { params }),
  getRecent: (params) => api.get('/api/audit/recent', { params }),
};

export const systemAPI = {
  health: () => api.get('/api/health'),
};

export default api;

