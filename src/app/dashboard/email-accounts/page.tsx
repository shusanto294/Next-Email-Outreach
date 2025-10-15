'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Mail, CheckCircle, XCircle, Edit } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

const createEmailAccountSchema = (isEditing: boolean = false) => z.object({
  email: z.string().email('Invalid email address'),
  provider: z.enum(['gmail', 'outlook', 'smtp', 'other']),
  fromName: z.string().min(1, 'From Name is required'),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.coerce.number().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1, 'SMTP username is required'),
  smtpPassword: isEditing
    ? z.string().optional()
    : z.string().min(1, 'SMTP password is required'),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.coerce.number().min(1).max(65535),
  imapSecure: z.boolean(),
  dailyLimit: z.coerce.number().min(1).max(1000).default(30),
});

type EmailAccountForm = z.infer<ReturnType<typeof createEmailAccountSchema>>;

interface EmailAccount {
  _id: string;
  email: string;
  provider: string;
  fromName?: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  isActive: boolean;
  dailyLimit: number;
  sentToday: number;
  lastResetDate?: string;
  lastUsed?: string;
}

export default function EmailAccountsPage() {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [testResults, setTestResults] = useState<{smtp?: any, imap?: any} | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<EmailAccountForm>({
    resolver: zodResolver(createEmailAccountSchema(!!editingAccount)),
    defaultValues: {
      provider: 'smtp',
      smtpPort: 587,
      smtpSecure: false,
      imapPort: 993,
      imapSecure: true,
      dailyLimit: 30,
    },
  });

  useEffect(() => {
    fetchEmailAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEmailAccounts = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      const response = await fetch('/api/email-accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch email accounts');
      }

      const data = await response.json();
      setEmailAccounts(data.emailAccounts);
    } catch (error) {
      console.error('Error fetching email accounts:', error);
      setError('Failed to load email accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    const formData = watch();
    
    // Validate required fields
    if (!formData.smtpHost || !formData.smtpPort || !formData.smtpUsername || !formData.smtpPassword || !formData.imapHost || !formData.imapPort) {
      setError('Please fill in all required fields before testing');
      return;
    }

    setIsTesting(true);
    setError('');
    setTestResults(null);

    const token = localStorage.getItem('token');

    try {
      const response = await fetch('/api/email-accounts/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Connection test failed');
      }

      setTestResults(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (data: EmailAccountForm) => {
    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('token');

    try {
      const isEditing = editingAccount !== null;
      const url = isEditing ? `/api/email-accounts/${editingAccount._id}` : '/api/email-accounts';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${isEditing ? 'update' : 'add'} email account`);
      }

      if (isEditing) {
        setEmailAccounts(emailAccounts.map(account => 
          account._id === editingAccount._id ? result.emailAccount : account
        ));
        setEditingAccount(null);
      } else {
        setEmailAccounts([...emailAccounts, result.emailAccount]);
        setShowAddForm(false);
      }
      
      reset();
      setTestResults(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save email account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (account: EmailAccount) => {
    setEditingAccount(account);
    setShowAddForm(false);
    setTestResults(null);
    setError('');
    
    // Populate form with account data
    reset({
      email: account.email,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: account.provider as any,
      fromName: account.fromName || '',
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpPort === 465, // Assume 465 is secure
      smtpUsername: account.email, // Usually same as email
      smtpPassword: '', // Never pre-fill password for security
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapPort === 993, // Assume 993 is secure
      dailyLimit: account.dailyLimit,
    });
  };

  const cancelEditing = () => {
    setEditingAccount(null);
    reset();
    setTestResults(null);
    setError('');
  };

  const deleteEmailAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this email account?')) {
      return;
    }

    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`/api/email-accounts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete email account');
      }

      setEmailAccounts(emailAccounts.filter(account => account._id !== id));
    } catch (error) {
      console.error('Error deleting email account:', error);
      setError('Failed to delete email account');
    }
  };

  const getProviderPresets = (provider: string) => {
    switch (provider) {
      case 'gmail':
        return {
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpSecure: false,
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          imapSecure: true,
        };
      case 'outlook':
        return {
          smtpHost: 'smtp-mail.outlook.com',
          smtpPort: 587,
          smtpSecure: false,
          imapHost: 'outlook.office365.com',
          imapPort: 993,
          imapSecure: true,
        };
      default:
        return {};
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Email Accounts</h1>
            <p className="text-gray-600 mt-2">
              Manage your email accounts for sending campaigns
            </p>
          </div>
          <Button onClick={() => {
            setShowAddForm(true);
            setTestResults(null);
            setError('');
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Email Account
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Add/Edit Email Account Form */}
        {(showAddForm || editingAccount) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{editingAccount ? 'Edit Email Account' : 'Add Email Account'}</CardTitle>
              <CardDescription>
                {editingAccount ? 'Update your email account settings' : 'Configure your email account for sending campaigns'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      {...register('email')}
                      className={errors.email ? 'border-red-500' : ''}
                    />
                    {errors.email && (
                      <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Name *
                    </label>
                    <Input
                      {...register('fromName')}
                      className={errors.fromName ? 'border-red-500' : ''}
                      placeholder="John Smith"
                    />
                    {errors.fromName && (
                      <p className="text-red-500 text-sm mt-1">{errors.fromName.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider
                    </label>
                    <select
                      {...register('provider')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      onChange={(e) => {
                        const presets = getProviderPresets(e.target.value);
                        // Update form values with presets using setValue
                        Object.entries(presets).forEach(([key, value]) => {
                          if (key in watch() && value !== undefined) {
                            // @ts-expect-error - Dynamic key access for form values
                            setValue(key, value);
                          }
                        });
                      }}
                    >
                      <option value="smtp">Custom SMTP</option>
                      <option value="gmail">Gmail</option>
                      <option value="outlook">Outlook</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SMTP Host
                    </label>
                    <Input
                      {...register('smtpHost')}
                      className={errors.smtpHost ? 'border-red-500' : ''}
                      placeholder="smtp.gmail.com"
                    />
                    {errors.smtpHost && (
                      <p className="text-red-500 text-sm mt-1">{errors.smtpHost.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SMTP Port
                    </label>
                    <Input
                      type="number"
                      {...register('smtpPort')}
                      className={errors.smtpPort ? 'border-red-500' : ''}
                      placeholder="587"
                    />
                    {errors.smtpPort && (
                      <p className="text-red-500 text-sm mt-1">{errors.smtpPort.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Daily Limit
                    </label>
                    <Input
                      type="number"
                      {...register('dailyLimit')}
                      className={errors.dailyLimit ? 'border-red-500' : ''}
                      placeholder="30"
                    />
                    {errors.dailyLimit && (
                      <p className="text-red-500 text-sm mt-1">{errors.dailyLimit.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SMTP Username
                    </label>
                    <Input
                      {...register('smtpUsername')}
                      className={errors.smtpUsername ? 'border-red-500' : ''}
                      placeholder="your-email@gmail.com"
                    />
                    {errors.smtpUsername && (
                      <p className="text-red-500 text-sm mt-1">{errors.smtpUsername.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SMTP Password {editingAccount && <span className="text-xs text-gray-500">(leave empty to keep current)</span>}
                    </label>
                    <Input
                      type="text"
                      {...register('smtpPassword')}
                      className={errors.smtpPassword ? 'border-red-500' : ''}
                      placeholder={editingAccount ? "Leave empty to keep current password" : "App password or regular password"}
                    />
                    {errors.smtpPassword && (
                      <p className="text-red-500 text-sm mt-1">{errors.smtpPassword.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('smtpSecure')}
                    id="smtpSecure"
                    className="rounded"
                  />
                  <label htmlFor="smtpSecure" className="text-sm text-gray-700">
                    Use SSL/TLS encryption for SMTP
                  </label>
                </div>

                {/* IMAP Configuration */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">IMAP Configuration</h4>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IMAP Host *
                      </label>
                      <Input
                        {...register('imapHost')}
                        className={errors.imapHost ? 'border-red-500' : ''}
                        placeholder="imap.gmail.com"
                      />
                      {errors.imapHost && (
                        <p className="text-red-500 text-sm mt-1">{errors.imapHost.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IMAP Port *
                      </label>
                      <Input
                        type="number"
                        {...register('imapPort')}
                        className={errors.imapPort ? 'border-red-500' : ''}
                        placeholder="993"
                      />
                      {errors.imapPort && (
                        <p className="text-red-500 text-sm mt-1">{errors.imapPort.message}</p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 mt-6">
                      <input
                        type="checkbox"
                        {...register('imapSecure')}
                        id="imapSecure"
                        className="rounded"
                      />
                      <label htmlFor="imapSecure" className="text-sm text-gray-700">
                        Use SSL/TLS for IMAP
                      </label>
                    </div>
                  </div>
                </div>

                {/* Test Connection Results */}
                {testResults && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium text-gray-900 mb-2">Connection Test Results</h4>
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-2 ${testResults.smtp.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResults.smtp.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        <span>SMTP: {testResults.smtp.success ? 'Connected' : testResults.smtp.error}</span>
                      </div>
                      <div className={`flex items-center space-x-2 ${testResults.imap.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResults.imap.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        <span>IMAP: {testResults.imap.success ? 'Connected' : testResults.imap.error}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={testConnection} 
                    disabled={isTesting}
                  >
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting 
                      ? (editingAccount ? 'Updating...' : 'Adding...') 
                      : (editingAccount ? 'Update Email Account' : 'Add Email Account')
                    }
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (editingAccount) {
                        cancelEditing();
                      } else {
                        setShowAddForm(false);
                        reset();
                        setTestResults(null);
                        setError('');
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Email Accounts List */}
        <div className="grid gap-6">
          {emailAccounts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No email accounts</h3>
                <p className="text-gray-600 mb-4">
                  Add your first email account to start sending campaigns
                </p>
                <Button onClick={() => {
                  setShowAddForm(true);
                  setTestResults(null);
                  setError('');
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Email Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            emailAccounts.map((account) => (
              <Card key={account._id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {account.isActive ? (
                          <CheckCircle className="w-8 h-8 text-green-500" />
                        ) : (
                          <XCircle className="w-8 h-8 text-red-500" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {account.email}
                        </h3>
                        <div className="text-sm text-gray-600 space-y-1">
                          {account.fromName && <p>From: {account.fromName}</p>}
                          <p>Provider: {account.provider.toUpperCase()}</p>
                          <p>SMTP: {account.smtpHost}:{account.smtpPort}</p>
                          <p>IMAP: {account.imapHost}:{account.imapPort}</p>
                          <p>Daily Limit: {account.dailyLimit} emails</p>
                          <p className="font-medium">
                            Sent Today: 
                            <span className={`ml-1 ${
                              (account.sentToday || 0) >= account.dailyLimit 
                                ? 'text-red-600' 
                                : (account.sentToday || 0) > account.dailyLimit * 0.8 
                                ? 'text-yellow-600' 
                                : 'text-green-600'
                            }`}>
                              {account.sentToday || 0}/{account.dailyLimit}
                            </span>
                          </p>
                          {account.lastUsed && (
                            <p>Last Used: {new Date(account.lastUsed).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        account.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        (account.sentToday || 0) >= account.dailyLimit 
                          ? 'bg-red-100 text-red-800' 
                          : (account.sentToday || 0) > account.dailyLimit * 0.8 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {account.sentToday || 0}/{account.dailyLimit} sent
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(account)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteEmailAccount(account._id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}