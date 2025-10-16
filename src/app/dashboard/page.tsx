'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: string;
  emailsSent: number;
  emailsLimit: number;
  timezone?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  ignoreKeywords?: string;
}

interface DashboardStats {
  campaignsCount: number;
  leadsCount: number;
  sentCount: number;
  repliedCount: number;
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
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-3.5-turbo');
  const [ignoreKeywords, setIgnoreKeywords] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingReplySettings, setIsSavingReplySettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [replySettingsMessage, setReplySettingsMessage] = useState('');
  const router = useRouter();

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
        setOpenaiApiKey(data.user.openaiApiKey || '');
        setOpenaiModel(data.user.openaiModel || 'gpt-3.5-turbo');
        setIgnoreKeywords(data.user.ignoreKeywords || '');

        // Fetch dashboard stats
        fetchDashboardStats(token);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const fetchDashboardStats = async (token: string) => {
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
      const sentCount = contacts.reduce((sum: number, contact: any) => sum + (contact.sent || 0), 0);
      const repliedCount = contacts.reduce((sum: number, contact: any) => sum + (contact.replied || 0), 0);

      setStats({
        campaignsCount,
        leadsCount,
        sentCount,
        repliedCount,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };



  const handleSaveAiSettings = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/ai-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          aiProvider: 'openai', // Always use OpenAI
          openaiApiKey: openaiApiKey.trim(),
          openaiModel,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save AI settings');
      }

      const data = await response.json();
      setUser(data.user);
      setSaveMessage('Open AI settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setSaveMessage('Failed to save Open AI settings. Please try again.');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReplySettings = async () => {
    setIsSavingReplySettings(true);
    setReplySettingsMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/reply-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ignoreKeywords: ignoreKeywords.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save reply settings');
      }

      const data = await response.json();
      setUser(data.user);
      setReplySettingsMessage('Reply settings saved successfully!');
      setTimeout(() => setReplySettingsMessage(''), 3000);
    } catch {
      setReplySettingsMessage('Failed to save reply settings. Please try again.');
      setTimeout(() => setReplySettingsMessage(''), 3000);
    } finally {
      setIsSavingReplySettings(false);
    }
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

        {/* Open AI Settings */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Open AI</CardTitle>
              <CardDescription>
                Configure OpenAI for email personalization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenAI Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key
                  </label>
                  <Input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="Enter OpenAI API key"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Model
                  </label>
                  <select
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <optgroup label="💰 Cost-Effective (Recommended for Cold Email)">
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Default)</option>
                      <option value="gpt-3.5-turbo-16k">GPT-3.5 Turbo 16K</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                    </optgroup>
                    <optgroup label="🚀 Next Generation (GPT-5 Series)">
                      <option value="gpt-5">GPT-5</option>
                      <option value="gpt-5-turbo">GPT-5 Turbo</option>
                      <option value="gpt-5-mini">GPT-5 Mini</option>
                    </optgroup>
                    <optgroup label="🧠 Advanced Reasoning">
                      <option value="o1">o1</option>
                      <option value="o1-mini">o1-mini</option>
                      <option value="o1-preview">o1-preview</option>
                    </optgroup>
                    <optgroup label="⚡ High Performance">
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-4-turbo-preview">GPT-4 Turbo Preview</option>
                      <option value="gpt-4">GPT-4</option>
                    </optgroup>
                    <optgroup label="📝 Text Optimization">
                      <option value="text-davinci-003">Text Davinci 003</option>
                      <option value="text-curie-001">Text Curie 001</option>
                      <option value="text-babbage-001">Text Babbage 001</option>
                      <option value="text-ada-001">Text Ada 001</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Save Button */}
              <Button 
                onClick={handleSaveAiSettings}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? 'Saving...' : 'Save Open AI Settings'}
              </Button>

              {/* Status Message */}
              {saveMessage && (
                <div className={`text-sm p-2 rounded ${
                  saveMessage.includes('success') 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {saveMessage}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reply Settings</CardTitle>
              <CardDescription>
                Configure keywords to ignore from received email replies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ignore Keywords
                  </label>
                  <textarea
                    value={ignoreKeywords}
                    onChange={(e) => setIgnoreKeywords(e.target.value)}
                    placeholder="Enter comma-separated keywords to ignore (e.g., unsubscribe, no thanks, not interested)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-none"
                    rows={5}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Replies containing these keywords will be ignored. Separate multiple keywords with commas.
                  </p>
                </div>

                <Button
                  onClick={handleSaveReplySettings}
                  disabled={isSavingReplySettings}
                  className="w-full"
                >
                  {isSavingReplySettings ? 'Saving...' : 'Save Reply Settings'}
                </Button>

                {/* Status Message */}
                {replySettingsMessage && (
                  <div className={`text-sm p-2 rounded ${
                    replySettingsMessage.includes('success')
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {replySettingsMessage}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}