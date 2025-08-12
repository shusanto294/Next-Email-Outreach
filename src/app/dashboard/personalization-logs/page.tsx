'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardHeader from '@/components/DashboardHeader';

interface ContactData {
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  personalization?: string;
}

interface FullPromptData {
  systemPrompt: string;
  contactContext: string;
  userPrompt: string;
  fullPrompt: string;
}

interface PersonalizationLog {
  _id: string;
  personalizationType: 'subject' | 'content';
  aiProvider: 'openai' | 'deepseek' | 'manual';
  aiModel?: string;
  originalPrompt: string;
  personalizedResult: string;
  websiteData: {
    url: string;
    websiteContent: string;
  } | null;
  contactData?: ContactData;
  fullPromptData?: FullPromptData;
  processingTime?: number;
  createdAt: string;
}

export default function PersonalizationLogsPage() {
  const [logs, setLogs] = useState<PersonalizationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchLogs = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        router.push('/auth/login');
        return;
      }

      try {
        const response = await fetch('/api/personalization-logs', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch personalization logs');
        }

        const data = await response.json();
        setLogs(data.logs || []);
      } catch (error) {
        console.error('Error fetching personalization logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [router]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">Loading personalization logs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Personalization Logs</h1>
          <p className="text-gray-600 mt-2">
            View AI prompts, generations, and website content
          </p>
        </div>

        <div className="space-y-6">
          {logs.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-gray-500">
                No personalization logs found.
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => (
              <Card key={log._id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {formatDate(log.createdAt)}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Complete Prompt */}
                  {log.fullPromptData && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Complete Prompt (System + User):</h4>
                      <div className="bg-yellow-50 p-4 rounded-md">
                        <div className="bg-white p-3 rounded border text-sm max-h-60 overflow-y-auto">
                          <pre className="whitespace-pre-wrap font-mono text-xs">
                            {log.fullPromptData.fullPrompt}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Generation */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">AI Generated Result:</h4>
                    <div className="bg-blue-50 p-4 rounded-md text-sm font-medium">
                      {log.personalizedResult}
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