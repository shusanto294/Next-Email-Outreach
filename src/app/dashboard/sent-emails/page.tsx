'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardHeader from '@/components/DashboardHeader';

interface EmailLog {
  _id: string;
  subject: string;
  content: string;
  sentAt: string;
}

export default function SentEmailsPage() {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        router.push('/auth/login');
        return;
      }

      try {
        const response = await fetch('/api/email-logs', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const emailsData = await response.json();
          setEmails(emailsData.emails || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">Loading sent emails...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sent Emails</h1>
          <p className="text-gray-600 mt-2">
            View subject lines and email content
          </p>
        </div>

        <div className="space-y-6">
          {emails.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-gray-500">
                No sent emails found.
              </CardContent>
            </Card>
          ) : (
            emails.map((email) => (
              <Card key={email._id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {formatDate(email.sentAt)}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Subject Line */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Subject Line:</h4>
                    <div className="bg-blue-50 p-4 rounded-md text-sm">
                      {email.subject}
                    </div>
                  </div>

                  {/* Email Body */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Email Body:</h4>
                    <div className="bg-gray-50 p-4 rounded-md text-sm whitespace-pre-wrap">
                      {email.content}
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