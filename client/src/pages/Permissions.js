import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import { permissionsAPI } from '../services/api';
import { toast } from 'react-hot-toast';
import {
  Key,
  Plus,
  Search,
  Edit,
  Trash2,
  Shield,
  Database,
  Eye,
  Lock,
  Unlock,
  Upload,
  Download
} from 'lucide-react';

const Permissions = () => {
  const { checkPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPermission, setSelectedPermission] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create'); // create, edit, view, delete, bulk
  const [formData, setFormData] = useState({
    resource: '',
    action: '',
    description: ''
  });
  const [bulkData, setBulkData] = useState('');

  // Check permissions
  const canViewPermissions = checkPermission('permissions:read');
  const canCreatePermissions = checkPermission('permissions:create');
  const canUpdatePermissions = checkPermission('permissions:update');
  const canDeletePermissions = checkPermission('permissions:delete');
  const canBulkCreatePermissions = checkPermission('permissions:bulk_create');

  // Fetch permissions
  const { data: permissions, isLoading, error } = useQuery(
    ['permissions', searchTerm, resourceFilter, actionFilter, statusFilter],
    () => permissionsAPI.getAll({
      search: searchTerm,
      resource: resourceFilter,
      action: actionFilter,
      status: statusFilter
    }),
    { enabled: canViewPermissions }
  );

  // Fetch distinct resources and actions for filters
  const { data: resources } = useQuery(
    ['permissions', 'resources'],
    () => permissionsAPI.getResources(),
    { enabled: canViewPermissions }
  );

  const { data: actions } = useQuery(
    ['permissions', 'actions'],
    () => permissionsAPI.getActions(),
    { enabled: canViewPermissions }
  );

  // Mutations
  const createPermissionMutation = useMutation(permissionsAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions']);
      toast.success('Permission created successfully');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create permission');
    }
  });

  const updatePermissionMutation = useMutation((data) => permissionsAPI.update(data.id, data), {
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions']);
      toast.success('Permission updated successfully');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update permission');
    }
  });

  const deletePermissionMutation = useMutation(permissionsAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions']);
      toast.success('Permission deleted successfully');
      setShowModal(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete permission');
    }
  });

  const bulkCreatePermissionMutation = useMutation(permissionsAPI.bulkCreate, {
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions']);
      toast.success('Permissions created successfully');
      setShowModal(false);
      setBulkData('');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create permissions');
    }
  });

  const togglePermissionStatusMutation = useMutation((data) => {
    if (data.status === 'active') {
      return permissionsAPI.activate(data.id);
    } else {
      return permissionsAPI.deactivate(data.id);
    }
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries(['permissions']);
      toast.success('Permission status updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  });

  const resetForm = () => {
    setFormData({
      resource: '',
      action: '',
      description: ''
    });
    setSelectedPermission(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (modalType === 'create') {
      createPermissionMutation.mutate(formData);
    } else if (modalType === 'edit') {
      updatePermissionMutation.mutate({ id: selectedPermission.id, ...formData });
    }
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();

    try {
      const permissions = bulkData.split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => {
          const [resource, action, description] = line.split('|').map(s => s.trim());
          return { resource, action, description: description || '' };
        });

      bulkCreatePermissionMutation.mutate(permissions);
    } catch (error) {
      toast.error('Invalid bulk data format. Use: resource|action|description (one per line)');
    }
  };

  const openModal = (type, permission = null) => {
    setModalType(type);
    setSelectedPermission(permission);
    if (type === 'edit' && permission) {
      setFormData({
        resource: permission.resource,
        action: permission.action,
        description: permission.description || ''
      });
    } else if (type === 'view' && permission) {
      setFormData({
        resource: permission.resource,
        action: permission.action,
        description: permission.description || ''
      });
    }
    setShowModal(true);
  };

  const handleDelete = () => {
    if (selectedPermission) {
      deletePermissionMutation.mutate(selectedPermission.id);
    }
  };

  const exportPermissions = () => {
    if (!permissions?.data) return;

    const csvContent = [
      'Resource,Action,Description,Status,Created At',
      ...permissions.data.map(p =>
        `"${p.resource}","${p.action}","${p.description || ''}","${p.status}","${p.createdAt}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'permissions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!canViewPermissions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view permissions.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-500 mb-4">Error loading permissions</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
          <p className="text-gray-600">Manage system permissions and access controls</p>
        </div>
        <div className="flex space-x-3">
          {canBulkCreatePermissions && (
            <button
              onClick={() => openModal('bulk')}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload className="w-5 h-5 mr-2" />
              Bulk Create
            </button>
          )}
          {canCreatePermissions && (
            <button
              onClick={() => openModal('create')}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Permission
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search permissions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resource</label>
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Resources</option>
              {resources?.data?.map(resource => (
                <option key={resource} value={resource}>{resource}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Actions</option>
              {actions?.data?.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-end space-x-2">
            <button
              onClick={() => {
                setSearchTerm('');
                setResourceFilter('all');
                setActionFilter('all');
                setStatusFilter('all');
              }}
              className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={exportPermissions}
              className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Permissions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {permissions?.data?.map((permission) => (
                <tr key={permission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Key className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {permission.resource}:{permission.action}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {permission.resource}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {permission.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="max-w-xs truncate" title={permission.description}>
                      {permission.description || 'No description'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${permission.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                      }`}>
                      {permission.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(permission.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      {canUpdatePermissions && (
                        <button
                          onClick={() => openModal('edit', permission)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Edit permission"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {canUpdatePermissions && (
                        <button
                          onClick={() => openModal('view', permission)}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="View permission details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {permission.status === 'active' ? (
                        <button
                          onClick={() => togglePermissionStatusMutation.mutate({ id: permission.id, status: 'inactive' })}
                          className="text-yellow-600 hover:text-yellow-900 p-1"
                          title="Deactivate permission"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => togglePermissionStatusMutation.mutate({ id: permission.id, status: 'active' })}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Activate permission"
                        >
                          <Unlock className="w-4 h-4" />
                        </button>
                      )}
                      {canDeletePermissions && (
                        <button
                          onClick={() => openModal('delete', permission)}
                          className="text-red-600 hover:text-red-900 p-1"
                          title="Delete permission"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {modalType === 'create' && 'Create New Permission'}
                  {modalType === 'edit' && 'Edit Permission'}
                  {modalType === 'view' && 'Permission Details'}
                  {modalType === 'delete' && 'Delete Permission'}
                  {modalType === 'bulk' && 'Bulk Create Permissions'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              {modalType === 'delete' && (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    Are you sure you want to delete permission "{selectedPermission?.resource}:{selectedPermission?.action}"? This action cannot be undone.
                  </p>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {modalType === 'bulk' && (
                <form onSubmit={handleBulkSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bulk Permissions (one per line)
                    </label>
                    <textarea
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      placeholder="Format: resource|action|description&#10;Example:&#10;users|read|View users&#10;users|create|Create users"
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Format: resource|action|description (one per line)
                    </p>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Create Permissions
                    </button>
                  </div>
                </form>
              )}

              {(modalType === 'create' || modalType === 'edit' || modalType === 'view') && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Resource</label>
                    <input
                      type="text"
                      value={formData.resource}
                      onChange={(e) => setFormData({ ...formData, resource: e.target.value })}
                      disabled={modalType === 'view'}
                      placeholder="e.g., users, roles, permissions"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                    <input
                      type="text"
                      value={formData.action}
                      onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                      disabled={modalType === 'view'}
                      placeholder="e.g., read, create, update, delete"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      disabled={modalType === 'view'}
                      placeholder="Describe what this permission allows"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  {modalType !== 'view' && (
                    <div className="flex space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        {modalType === 'create' ? 'Create' : 'Update'}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Permissions;
