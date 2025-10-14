'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardHeader from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Swal from 'sweetalert2';
import {
  Mail,
  MailOpen,
  Send,
  Inbox,
  Search,
  Star,
  Trash2,
  Archive,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Reply,
  X,
} from 'lucide-react';

interface Email {
  _id: string;
  type: 'sent' | 'received';
  from: string;
  to: string;
  subject: string;
  date: Date;
  isRead?: boolean;
  isStarred?: boolean;
  status?: string;
  opened?: boolean;
  emailAccountId?: {
    email: string;
    provider: string;
  };
  contactId?: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
  };
  campaignId?: {
    name: string;
  };
}

export default function UniboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailDetails, setEmailDetails] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSent, setTotalSent] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('received');
  const [category, setCategory] = useState<string>('');
  const [isReadFilter, setIsReadFilter] = useState<string>('');
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Initialize filter from URL params
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam === 'sent' || typeParam === 'received') {
      setFilter(typeParam);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchEmails();
  }, [page, filter, category, isReadFilter]);

  const fetchEmails = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('token');

    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        type: filter,
      });

      if (category) params.append('category', category);
      if (isReadFilter) params.append('isRead', isReadFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/unibox?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const data = await response.json();
      setEmails(data.emails);
      setTotalPages(data.pagination.totalPages);
      setTotalSent(data.pagination.totalSent);
      setTotalReceived(data.pagination.totalReceived);
    } catch (error) {
      console.error('Error fetching emails:', error);
      setError('Failed to load emails');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailDetails = async (email: Email) => {
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`/api/unibox/${email._id}?type=${email.type}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch email details');
      }

      const data = await response.json();
      setEmailDetails(data.email);
      setSelectedEmail(email);
      setShowDetailsModal(true);

      // Update the email in the list if it was marked as read
      if (email.type === 'received' && !email.isRead) {
        setEmails(prev => prev.map(e =>
          e._id === email._id ? { ...e, isRead: true } : e
        ));
      }
    } catch (error) {
      console.error('Error fetching email details:', error);
    }
  };

  const handleTypeChange = (type: 'sent' | 'received') => {
    setFilter(type);
    setPage(1);
    router.push(`/dashboard/unibox?type=${type}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmails();
  };

  const handleReply = () => {
    if (!emailDetails || emailDetails.type !== 'received') {
      return;
    }

    // Prepare reply subject
    const originalSubject = emailDetails.subject || '';
    const replyPrefix = originalSubject.toLowerCase().startsWith('re:') ? '' : 'Re: ';
    setReplySubject(replyPrefix + originalSubject);

    // Prepare reply body with quoted original
    const quotedContent = emailDetails.content
      ? '\n\n---\n' + emailDetails.content.split('\n').map((line: string) => '> ' + line).join('\n')
      : '';
    setReplyBody(quotedContent);

    setShowReplyModal(true);
  };

  const handleSendReply = async () => {
    if (!emailDetails || !replyBody.trim()) {
      return;
    }

    setIsSendingReply(true);
    const token = localStorage.getItem('token');

    try {
      const response = await fetch('/api/unibox/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          originalEmailId: emailDetails._id,
          to: emailDetails.from,
          subject: replySubject,
          content: replyBody,
          inReplyTo: emailDetails.messageId,
          threadId: emailDetails.threadId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send reply');
      }

      const data = await response.json();

      setShowReplyModal(false);
      setReplySubject('');
      setReplyBody('');

      // Show success alert with SweetAlert2
      Swal.fire({
        icon: 'success',
        title: 'Reply Sent!',
        text: 'Your reply has been sent successfully',
        timer: 1000,
        showConfirmButton: true,
        confirmButtonText: 'Close',
        confirmButtonColor: '#3b82f6',
        timerProgressBar: true,
      });

      // Refresh emails to show the sent reply
      fetchEmails();
    } catch (error: any) {
      console.error('Error sending reply:', error);

      // Show error alert with SweetAlert2
      Swal.fire({
        icon: 'error',
        title: 'Failed to Send',
        text: error.message || 'Failed to send reply. Please try again.',
        confirmButtonText: 'Close',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return d.toLocaleDateString();
    }
  };

  const getEmailDisplayName = (email: Email) => {
    if (email.type === 'sent') {
      if (email.contactId) {
        const { firstName, lastName, company } = email.contactId;
        const name = [firstName, lastName].filter(Boolean).join(' ');
        return name || email.to;
      }
      return email.to;
    } else {
      return email.from;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Unibox</h1>
          <p className="text-gray-600 mt-2">
            View all your sent and received emails in one place
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card
            className={`p-4 cursor-pointer transition-all hover:shadow-lg ${
              filter === 'received' ? 'ring-2 ring-purple-500' : ''
            }`}
            onClick={() => handleTypeChange('received')}
          >
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Inbox className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Received</div>
                <div className="text-2xl font-bold">{totalReceived}</div>
              </div>
            </div>
          </Card>

          <Card
            className={`p-4 cursor-pointer transition-all hover:shadow-lg ${
              filter === 'sent' ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => handleTypeChange('sent')}
          >
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <Send className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Sent</div>
                <div className="text-2xl font-bold">{totalSent}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Search and Refresh */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchEmails()}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Email List - Full Width */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              Loading emails...
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No emails found
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((email) => (
                <div
                  key={email._id}
                  onClick={() => fetchEmailDetails(email)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition ${
                    email.type === 'received' && !email.isRead ? 'font-semibold' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {email.type === 'sent' ? (
                        <Send className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        email.isRead ? (
                          <MailOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        )
                      )}
                      <span className="text-sm truncate">
                        {getEmailDisplayName(email)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatDate(email.date)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 truncate ml-6">
                    {email.subject || '(No subject)'}
                  </div>
                  {email.campaignId && (
                    <div className="text-xs text-gray-500 mt-1 ml-6">
                      Campaign: {email.campaignId.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t p-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </Card>

        {/* Email Details Modal */}
        {showDetailsModal && emailDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">
                    {emailDetails.subject || '(No subject)'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      setEmailDetails(null);
                      setSelectedEmail(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Email Header */}
                <div className="border-b pb-4 mb-4">
                  <div className="flex items-start justify-between mb-2">
                    {emailDetails.type === 'sent' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Sent
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                        Received
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">From:</span>{' '}
                      <span className="font-medium">{emailDetails.from}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">To:</span>{' '}
                      <span className="font-medium">{emailDetails.to}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Date:</span>{' '}
                      <span className="font-medium">
                        {new Date(emailDetails.date).toLocaleString()}
                      </span>
                    </div>
                    {emailDetails.campaignId && (
                      <div>
                        <span className="text-gray-600">Campaign:</span>{' '}
                        <span className="font-medium">{emailDetails.campaignId.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Reply Button for Received Emails */}
                  {emailDetails.type === 'received' && (
                    <div className="mt-4">
                      <Button
                        onClick={handleReply}
                        className="flex items-center gap-2"
                      >
                        <Reply className="w-4 h-4" />
                        Reply
                      </Button>
                    </div>
                  )}
                </div>

                {/* Email Content */}
                <div className="prose max-w-none">
                  {emailDetails.htmlContent ? (
                    <div dangerouslySetInnerHTML={{ __html: emailDetails.htmlContent }} />
                  ) : (
                    <div className="whitespace-pre-wrap">{emailDetails.content}</div>
                  )}
                </div>

                {/* Email Metadata (for sent emails) */}
                {emailDetails.type === 'sent' && (
                  <div className="mt-6 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Status:</span>{' '}
                        <span className={`font-medium ${
                          emailDetails.status === 'delivered' ? 'text-green-600' :
                          emailDetails.status === 'failed' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          {emailDetails.status}
                        </span>
                      </div>
                      {emailDetails.opened && (
                        <div>
                          <span className="text-gray-600">Opened:</span>{' '}
                          <span className="font-medium text-green-600">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reply Modal */}
        {showReplyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Reply to Email</h2>
                  <button
                    onClick={() => setShowReplyModal(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To
                    </label>
                    <Input
                      type="email"
                      value={emailDetails?.from || ''}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject
                    </label>
                    <Input
                      type="text"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Subject"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={12}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Type your reply here..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowReplyModal(false)}
                      disabled={isSendingReply}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSendReply}
                      disabled={isSendingReply || !replyBody.trim()}
                      className="flex items-center gap-2"
                    >
                      {isSendingReply ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Reply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
