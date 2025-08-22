import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import { rolesAPI, permissionsAPI } from '../services/api';
import { toast } from 'react-hot-toast';
import {
  Shield,
  Plus,
  Search,
  Edit,
  Trash2,
  Key,
  Users,
  Eye,
  Lock,
  Unlock
} from 'lucide-react';

const Roles = () => {
  const { checkPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRole, setSelectedRole] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create'); // create, edit, view, delete, permissions
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isSystem: false
  });

  // Check permissions
  const canViewRoles = checkPermission('roles:read');
  const canCreateRoles = checkPermission('roles:create');
  const canUpdateRoles = checkPermission('roles:update');
  const canDeleteRoles = checkPermission('roles:delete');
  const canAssignPermissions = checkPermission('roles:assign_permissions');

  // Fetch roles
  const { data: roles, isLoading, error } = useQuery(
    ['roles', searchTerm, statusFilter],
    () => rolesAPI.getAll({ search: searchTerm, status: statusFilter }),
    { enabled: canViewRoles }
  );

  // Fetch permissions for assignment
  const { data: permissions } = useQuery(
    ['permissions'],
    () => permissionsAPI.getAll(),
    { enabled: canAssignPermissions }
  );

  // Mutations
  const createRoleMutation = useMutation(rolesAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role created successfully');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create role');
    }
  });

  const updateRoleMutation = useMutation((data) => rolesAPI.update(data.id, data), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role updated successfully');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update role');
    }
  });

  const deleteRoleMutation = useMutation(rolesAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role deleted successfully');
      setShowModal(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete role');
    }
  });

  const assignPermissionMutation = useMutation((data) => rolesAPI.assignPermission(data.roleId, { permissionId: data.permissionId }), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Permission assigned successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to assign permission');
    }
  });

  const toggleRoleStatusMutation = useMutation((data) => {
    if (data.status === 'active') {
      return rolesAPI.activate(data.id);
    } else {
      return rolesAPI.deactivate(data.id);
    }
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role status updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      isSystem: false
    });
    setSelectedRole(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (modalType === 'create') {
      createRoleMutation.mutate(formData);
    } else if (modalType === 'edit') {
      updateRoleMutation.mutate({ id: selectedRole.id, ...formData });
    }
  };

  const openModal = (type, role = null) => {
    setModalType(type);
    setSelectedRole(role);
    if (type === 'edit' && role) {
      setFormData({
        name: role.name,
        description: role.description || '',
        isSystem: role.isSystem || false
      });
    } else if (type === 'view' && role) {
      setFormData({
        name: role.name,
        description: role.description || '',
        isSystem: role.isSystem || false
      });
    }
    setShowModal(true);
  };

  const handleDelete = () => {
    if (selectedRole) {
      deleteRoleMutation.mutate(selectedRole.id);
    }
  };

  const handlePermissionAssignment = (roleId, permissionId, action) => {
    if (action === 'assign') {
      assignPermissionMutation.mutate({ roleId, permissionId });
    } else {
      // Remove permission logic would go here
      toast.info('Permission removal not implemented yet');
    }
  };

  const getPermissionCount = (role) => {
    return role.permissions?.length || 0;
  };

  const getUserCount = (role) => {
    return role.userCount || 0;
  };

  if (!canViewRoles) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view roles.</p>
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
          <div className="text-red-500 mb-4">Error loading roles</div>
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
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-600">Manage system roles and their permissions</p>
        </div>
        {canCreateRoles && (
          <button
            onClick={() => openModal('create')}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Role
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="w-full px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles?.data?.map((role) => (
          <div key={role.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">{role.name}</h3>
                    {role.isSystem && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        System Role
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {role.status === 'active' ? (
                    <button
                      onClick={() => toggleRoleStatusMutation.mutate({ id: role.id, status: 'inactive' })}
                      className="text-yellow-600 hover:text-yellow-900 p-1"
                      title="Deactivate role"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleRoleStatusMutation.mutate({ id: role.id, status: 'active' })}
                      className="text-green-600 hover:text-green-900 p-1"
                      title="Activate role"
                    >
                      <Unlock className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-4">
                {role.description || 'No description provided'}
              </p>

              <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                <div className="flex items-center">
                  <Key className="w-4 h-4 mr-1" />
                  <span>{getPermissionCount(role)} permissions</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  <span>{getUserCount(role)} users</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  {canUpdateRoles && (
                    <button
                      onClick={() => openModal('edit', role)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Edit role"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {canAssignPermissions && (
                    <button
                      onClick={() => openModal('permissions', role)}
                      className="text-green-600 hover:text-green-900 p-1"
                      title="Manage permissions"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  )}
                  {canUpdateRoles && (
                    <button
                      onClick={() => openModal('view', role)}
                      className="text-gray-600 hover:text-gray-900 p-1"
                      title="View role details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {canDeleteRoles && !role.isSystem && (
                  <button
                    onClick={() => openModal('delete', role)}
                    className="text-red-600 hover:text-red-900 p-1"
                    title="Delete role"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {modalType === 'create' && 'Create New Role'}
                  {modalType === 'edit' && 'Edit Role'}
                  {modalType === 'view' && 'Role Details'}
                  {modalType === 'delete' && 'Delete Role'}
                  {modalType === 'permissions' && 'Manage Role Permissions'}
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
                    Are you sure you want to delete role "{selectedRole?.name}"? This action cannot be undone.
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

              {modalType === 'permissions' && (
                <div>
                  <p className="text-gray-600 mb-4">
                    Manage permissions for role "{selectedRole?.name}"
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {permissions?.data?.map((permission) => {
                      const hasPermission = selectedRole?.permissions?.some(p => p.id === permission.id);
                      return (
                        <div key={permission.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="text-sm font-medium">{permission.resource}</span>
                            <span className="text-xs text-gray-500 ml-2">({permission.action})</span>
                          </div>
                          <button
                            onClick={() => handlePermissionAssignment(selectedRole.id, permission.id, hasPermission ? 'remove' : 'assign')}
                            className={`px-3 py-1 text-xs rounded ${hasPermission
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                          >
                            {hasPermission ? 'Remove' : 'Assign'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(modalType === 'create' || modalType === 'edit' || modalType === 'view') && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={modalType === 'view' || selectedRole?.isSystem}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      disabled={modalType === 'view'}
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

export default Roles;
