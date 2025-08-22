import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { rolesAPI } from '../services/api';

const RequestRole = () => {
    const [role, setRole] = useState('');
    const [reason, setReason] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await rolesAPI.requestRole({ role, reason });
            toast.success('Role request submitted!');
            navigate('/dashboard');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to submit request');
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 bg-white p-6 rounded shadow">
            <h2 className="text-xl font-bold mb-4">Request a Role</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 border rounded">
                        <option value="">Select a role</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Reason</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border rounded" rows={3} placeholder="Why do you need this role?" />
                </div>
                <button type="submit" className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700">Request Role</button>
            </form>
        </div>
    );
};

export default RequestRole;
