'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardHeader() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();

    // Poll for unread count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/unibox/unread-count', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            Outreach
          </button>
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => router.push('/dashboard/email-accounts')}>
              Email Accounts
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
              Campaigns
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/contacts')}>
              Contacts
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/unibox')} className="relative">
              Unibox
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}