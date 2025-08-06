'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
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
  aiProvider?: 'openai' | 'deepseek' | null;
  openaiApiKey?: string;
  openaiModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
}



export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiProvider, setAiProvider] = useState<'openai' | 'deepseek' | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat');
  const [timezone, setTimezone] = useState('UTC');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
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
        setAiProvider(data.user.aiProvider || null);
        setOpenaiApiKey(data.user.openaiApiKey || '');
        setOpenaiModel(data.user.openaiModel || 'gpt-4o-mini');
        setDeepseekApiKey(data.user.deepseekApiKey || '');
        setDeepseekModel(data.user.deepseekModel || 'deepseek-chat');
        setTimezone(data.user.timezone || 'UTC');
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);



  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  const handleSaveAiSettings = async () => {
    // If a provider is selected, make sure its API key is provided (either currently entered or previously saved)
    if (aiProvider === 'openai' && !openaiApiKey.trim() && !user?.openaiApiKey) {
      setSaveMessage('Please enter OpenAI API key for the selected provider');
      return;
    }

    if (aiProvider === 'deepseek' && !deepseekApiKey.trim() && !user?.deepseekApiKey) {
      setSaveMessage('Please enter DeepSeek API key for the selected provider');
      return;
    }

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
          aiProvider,
          openaiApiKey: openaiApiKey.trim(),
          openaiModel,
          deepseekApiKey: deepseekApiKey.trim(),
          deepseekModel,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save AI settings');
      }

      const data = await response.json();
      setUser(data.user);
      setSaveMessage('AI settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to save AI settings. Please try again.');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderChange = (provider: 'openai' | 'deepseek') => {
    if (aiProvider === provider) {
      setAiProvider(null); // Deactivate if clicking the same provider
    } else {
      setAiProvider(provider); // Switch to the new provider
    }
  };

  const handleSaveUserSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          timezone,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save user settings');
      }

      const data = await response.json();
      setUser(data.user);
      setSettingsMessage('User settings saved successfully!');
      setTimeout(() => setSettingsMessage(''), 3000);
    } catch (error) {
      setSettingsMessage('Failed to save user settings. Please try again.');
      setTimeout(() => setSettingsMessage(''), 3000);
    } finally {
      setIsSavingSettings(false);
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Manage your email campaigns and track performance
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Emails Sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {user.emailsSent.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">
                {user.emailsLimit - user.emailsSent} remaining this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Active Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500">No active campaigns</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Open Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">0%</div>
              <p className="text-sm text-gray-500">No data available</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Reply Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">0%</div>
              <p className="text-sm text-gray-500">No data available</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Model Settings */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>AI Model</CardTitle>
              <CardDescription>
                Configure your AI provider for email personalization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Active Provider */}
              {aiProvider && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800">
                    Active Provider: {aiProvider === 'openai' ? 'OpenAI' : 'DeepSeek'}
                  </p>
                  <p className="text-xs text-blue-600">
                    This provider will be used for AI-generated content
                  </p>
                </div>
              )}

              {/* OpenAI Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 font-bold text-sm">AI</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">OpenAI</h3>
                      <p className="text-sm text-gray-500">GPT-4 & GPT-3.5 models</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Inactive</span>
                    <ToggleSwitch
                      checked={aiProvider === 'openai'}
                      onCheckedChange={() => handleProviderChange('openai')}
                      size="md"
                    />
                    <span className="text-xs text-green-600">Active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model
                    </label>
                    <select
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* DeepSeek Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">DS</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">DeepSeek</h3>
                      <p className="text-sm text-gray-500">Advanced reasoning models</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Inactive</span>
                    <ToggleSwitch
                      checked={aiProvider === 'deepseek'}
                      onCheckedChange={() => handleProviderChange('deepseek')}
                      size="md"
                    />
                    <span className="text-xs text-blue-600">Active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key
                    </label>
                    <Input
                      type="password"
                      value={deepseekApiKey}
                      onChange={(e) => setDeepseekApiKey(e.target.value)}
                      placeholder="Enter DeepSeek API key"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model
                    </label>
                    <select
                      value={deepseekModel}
                      onChange={(e) => setDeepseekModel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="deepseek-chat">DeepSeek Chat</option>
                      <option value="deepseek-coder">DeepSeek Coder</option>
                      <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <Button 
                onClick={handleSaveAiSettings}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? 'Saving...' : 'Save AI Settings'}
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
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your current plan and usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Plan:</span>
                  <span className="font-medium capitalize">{user.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Limit:</span>
                  <span className="font-medium">{user.emailsLimit.toLocaleString()}</span>
                </div>
                {aiProvider && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active AI:</span>
                    <span className="font-medium capitalize">
                      {aiProvider} ({aiProvider === 'openai' ? openaiModel : deepseekModel})
                    </span>
                  </div>
                )}
                {(openaiApiKey || deepseekApiKey) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Configured:</span>
                    <span className="font-medium text-sm">
                      {openaiApiKey && 'OpenAI'}{openaiApiKey && deepseekApiKey && ' + '}{deepseekApiKey && 'DeepSeek'}
                    </span>
                  </div>
                )}
              </div>

              {/* Timezone Settings Section */}
              <div className="border-t pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (EST/EDT)</option>
                    <option value="America/Chicago">Central Time (CST/CDT)</option>
                    <option value="America/Denver">Mountain Time (MST/MDT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                    <option value="America/Phoenix">Mountain Time (MST)</option>
                    <option value="America/Anchorage">Alaska Time (AKST/AKDT)</option>
                    <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Central European Time (CET/CEST)</option>
                    <option value="Europe/Berlin">Central European Time (CET/CEST)</option>
                    <option value="Europe/Rome">Central European Time (CET/CEST)</option>
                    <option value="Europe/Madrid">Central European Time (CET/CEST)</option>
                    <option value="Europe/Amsterdam">Central European Time (CET/CEST)</option>
                    <option value="Europe/Stockholm">Central European Time (CET/CEST)</option>
                    <option value="Europe/Moscow">Moscow Time (MSK)</option>
                    <option value="Asia/Dubai">Gulf Standard Time (GST)</option>
                    <option value="Asia/Kolkata">India Standard Time (IST)</option>
                    <option value="Asia/Dhaka">Bangladesh Standard Time (BST)</option>
                    <option value="Asia/Bangkok">Indochina Time (ICT)</option>
                    <option value="Asia/Singapore">Singapore Standard Time (SGT)</option>
                    <option value="Asia/Shanghai">China Standard Time (CST)</option>
                    <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                    <option value="Asia/Seoul">Korea Standard Time (KST)</option>
                    <option value="Australia/Sydney">Australian Eastern Time (AEST/AEDT)</option>
                    <option value="Australia/Melbourne">Australian Eastern Time (AEST/AEDT)</option>
                    <option value="Australia/Perth">Australian Western Time (AWST)</option>
                    <option value="Pacific/Auckland">New Zealand Time (NZST/NZDT)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Current time: {new Date().toLocaleString('en-US', { timeZone: timezone })}
                  </p>
                </div>

                <Button 
                  onClick={handleSaveUserSettings}
                  disabled={isSavingSettings}
                  variant="outline"
                  className="w-full"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </Button>

                {/* Settings Status Message */}
                {settingsMessage && (
                  <div className={`text-sm p-2 rounded ${
                    settingsMessage.includes('success') 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {settingsMessage}
                  </div>
                )}
              </div>

              <div className="pt-2 space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full text-red-600 hover:text-red-800 hover:border-red-300"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Notice */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Status</CardTitle>
            <CardDescription>
              Development Progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-blue-800 font-medium mb-2">🚧 Platform Under Development</h3>
              <p className="text-blue-700 text-sm">
                This cold email platform is currently being built with features similar to Instantly AI. 
                Core functionality including email account management, campaign creation, contact management, 
                and analytics dashboard are in development.
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>User Authentication System</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Database Schema & Models</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Email Account Management</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Contact Management & CSV Import</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Campaign Builder with Sequences</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Email Sending Engine</span>
                </div>
              </div>
              

            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}