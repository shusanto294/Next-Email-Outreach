'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function DashboardHeader() {
  const router = useRouter();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <button 
            onClick={() => router.push('/dashboard')}
            className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            Cold Email Platform
          </button>
          <div className="space-x-4">
            <Button variant="outline" onClick={() => router.push('/dashboard/email-accounts')}>
              Email Accounts
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
              Campaigns
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/contacts')}>
              Contacts
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}