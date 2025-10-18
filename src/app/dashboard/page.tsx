'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: string;
  emailsSent: number;
  emailsLimit: number;
}

interface DashboardStats {
  campaignsCount: number;
  leadsCount: number;
  sentCount: number;
  repliedCount: number;
}

interface Log {
  _id: string;
  userId: string;
  source: 'send' | 'receive';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface LogsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}



export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    campaignsCount: 0,
    leadsCount: 0,
    sentCount: 0,
    repliedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsPagination, setLogsPagination] = useState<LogsPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const router = useRouter();

  const fetchLogs = async (token: string, page: number) => {
    try {
      setIsLoadingLogs(true);
      const response = await fetch(`/api/logs?page=${page}&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setLogsPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const fetchDashboardStats = useCallback(async (token: string) => {
    try {
      // Fetch campaigns count
      const campaignsRes = await fetch('/api/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const campaignsData = await campaignsRes.json();
      const campaignsCount = campaignsData.campaigns?.length || 0;

      // Fetch contacts with a large limit to get all contacts for aggregation
      // We need to fetch all contacts to calculate sent and replied counts
      const contactsRes = await fetch('/api/contacts?limit=10000', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const contactsData = await contactsRes.json();
      const contacts = contactsData.contacts || [];
      const leadsCount = contactsData.pagination?.total || 0; // Use total from pagination
      const sentCount = contacts.reduce((sum: number, contact: { sent?: number }) => sum + (contact.sent || 0), 0);
      const repliedCount = contacts.reduce((sum: number, contact: { replied?: number }) => sum + (contact.replied || 0), 0);

      setStats({
        campaignsCount,
        leadsCount,
        sentCount,
        repliedCount,
      });

      // Fetch logs
      fetchLogs(token, 1);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        router.push('/auth/login');
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Authentication failed');
        }

        const data = await response.json();
        setUser(data.user);

        // Fetch dashboard stats
        await fetchDashboardStats(token);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router, fetchDashboardStats]);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      setIsClearingLogs(true);
      const response = await fetch('/api/logs', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to clear logs');
      }

      const data = await response.json();
      alert(data.message);

      // Refresh logs
      fetchLogs(token, 1);
    } catch (error) {
      console.error('Error clearing logs:', error);
      alert('Failed to clear logs');
    } finally {
      setIsClearingLogs(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchLogs(token, newPage);
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getSourceBadgeColor = (source: string) => {
    return source === 'send'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-teal-100 text-teal-700';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Manage your email campaigns and track performance
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/dashboard/settings')}
            className="hover:bg-gray-100"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Campaigns Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats.campaignsCount.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">
                Total campaigns
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Leads Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats.leadsCount.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">Total contacts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Sent Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats.sentCount.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">Total emails sent</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Replied Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats.repliedCount.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">Total replies received</p>
            </CardContent>
          </Card>
        </div>

        {/* Activity Logs Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold">Activity Logs</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Real-time logs from email sending and receiving processes
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const token = localStorage.getItem('token');
                    if (token) fetchLogs(token, logsPagination.page);
                  }}
                  disabled={isLoadingLogs}
                  className="hover:bg-gray-100"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearLogs}
                  disabled={isClearingLogs || logs.length === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isClearingLogs ? 'Clearing...' : 'Clear All Logs'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLogs && logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No logs available.
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {logs.map((log) => (
                    <div
                      key={log._id}
                      className={`p-3 rounded-lg border ${getLogLevelColor(log.level)}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSourceBadgeColor(log.source)}`}>
                              {log.source.toUpperCase()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${getLogLevelColor(log.level)}`}>
                              {log.level.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{log.message}</p>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="mt-2 text-xs text-gray-600">
                              {Object.entries(log.metadata).map(([key, value]) => (
                                <span key={key} className="mr-3">
                                  <strong>{key}:</strong> {String(value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {logsPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      Showing page {logsPagination.page} of {logsPagination.totalPages} ({logsPagination.total} total logs)
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(logsPagination.page - 1)}
                        disabled={logsPagination.page === 1 || isLoadingLogs}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(logsPagination.page + 1)}
                        disabled={!logsPagination.hasMore || isLoadingLogs}
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}