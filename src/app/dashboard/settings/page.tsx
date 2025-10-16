'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
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
        setFirstName(data.user.firstName || '');
        setLastName(data.user.lastName || '');
        setEmail(data.user.email || '');
        setTimezone(data.user.timezone || 'UTC');
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  const handleSaveAccountInfo = async () => {
    setIsSavingAccount(true);
    setAccountMessage('');

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setAccountMessage('Please enter a valid email address.');
      setIsSavingAccount(false);
      setTimeout(() => setAccountMessage(''), 3000);
      return;
    }

    // Validate names
    if (!firstName.trim() || !lastName.trim()) {
      setAccountMessage('First name and last name are required.');
      setIsSavingAccount(false);
      setTimeout(() => setAccountMessage(''), 3000);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/account', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save account information');
      }

      const data = await response.json();
      setUser(data.user);
      setAccountMessage('Account information saved successfully!');
      setTimeout(() => setAccountMessage(''), 3000);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Failed to save account information. Please try again.');
      setTimeout(() => setAccountMessage(''), 3000);
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleChangePassword = async () => {
    setIsSavingPassword(true);
    setPasswordMessage('');

    // Validate passwords
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('All password fields are required.');
      setIsSavingPassword(false);
      setTimeout(() => setPasswordMessage(''), 3000);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters long.');
      setIsSavingPassword(false);
      setTimeout(() => setPasswordMessage(''), 3000);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      setIsSavingPassword(false);
      setTimeout(() => setPasswordMessage(''), 3000);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change password');
      }

      setPasswordMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Failed to change password. Please try again.');
      setTimeout(() => setPasswordMessage(''), 3000);
    } finally {
      setIsSavingPassword(false);
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
    } catch {
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

      {/* Settings Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Account Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <Input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan
                </label>
                <div className="text-base text-gray-900 capitalize">{user.plan}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Usage
                </label>
                <div className="text-base text-gray-900">
                  {user.emailsSent.toLocaleString()} / {user.emailsLimit.toLocaleString()}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveAccountInfo}
              disabled={isSavingAccount}
              className="w-full"
            >
              {isSavingAccount ? 'Saving...' : 'Save Account Information'}
            </Button>

            {/* Account Status Message */}
            {accountMessage && (
              <div className={`text-sm p-2 rounded ${
                accountMessage.includes('success')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {accountMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your account password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={isSavingPassword}
              className="w-full"
            >
              {isSavingPassword ? 'Changing Password...' : 'Change Password'}
            </Button>

            {/* Password Status Message */}
            {passwordMessage && (
              <div className={`text-sm p-2 rounded ${
                passwordMessage.includes('success')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {passwordMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timezone Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Timezone Settings</CardTitle>
            <CardDescription>
              Configure your timezone for scheduling emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>
              Actions that affect your account session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full text-red-600 hover:text-red-800 hover:border-red-300"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
