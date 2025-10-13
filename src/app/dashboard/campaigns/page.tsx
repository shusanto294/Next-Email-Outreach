'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Mail, Users, BarChart3, Trash2, Edit } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

interface Campaign {
  _id: string;
  name: string;
  isActive: boolean;
  emailAccountIds: Array<{
    _id: string;
    email: string;
    provider: string;
    fromName?: string;
    replyToEmail?: string;
  }>;
  contactCount: number;
  sequences: Array<{
    stepNumber: number;
    subject: string;
    content: string;
    nextEmailAfter: number;
    isActive: boolean;
  }>;
  schedule: {
    timezone: string;
    sendingHours: {
      start: string;
      end: string;
    };
    sendingDays: number[];
    emailDelaySeconds: number;
  };
  trackOpens: boolean;
  trackClicks: boolean;
  unsubscribeLink: boolean;
  emailSent: number;
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      const response = await fetch('/api/campaigns', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }

      const data = await response.json();
      setCampaigns(data.campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setError('Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  };


  const deleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) {
      return;
    }

    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete campaign');
      }

      setCampaigns(campaigns.filter(campaign => campaign._id !== id));
    } catch (error) {
      console.error('Error deleting campaign:', error);
      setError('Failed to delete campaign');
    }
  };

  const createNewCampaign = async () => {
    setIsCreating(true);
    setError('');
    
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: `Campaign ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          // Email fields directly in campaign (new schema)
          subject: 'Your Subject Here',
          content: 'Your email content here...',
          useAiForSubject: false,
          aiSubjectPrompt: '',
          useAiForContent: false,
          aiContentPrompt: '',
          contactCount: 0,
          isActive: false,
          emailAccountIds: [],
          schedule: {
            timezone: 'Asia/Dhaka',
            sendingHours: {
              start: '09:00',
              end: '17:00',
            },
            sendingDays: [1, 2, 3, 4, 5],
            emailDelaySeconds: 60,
          },
          trackOpens: true,
          trackClicks: true,
          unsubscribeLink: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create campaign');
      }

      const result = await response.json();
      router.push(`/dashboard/campaigns/${result.campaign._id}/edit`);
    } catch (error) {
      console.error('Error creating campaign:', error);
      setError('Failed to create campaign');
    } finally {
      setIsCreating(false);
    }
  };


  const calculateOpenRate = (opened: number, sent: number) => {
    if (sent === 0) return 0;
    return Math.round((opened / sent) * 100);
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
            <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-gray-600 mt-2">
              Create and manage your email campaigns
            </p>
          </div>
          <Button 
            onClick={createNewCampaign}
            disabled={isCreating}
          >
            <Plus className="w-4 h-4 mr-2" />
            {isCreating ? 'Creating...' : 'Create Campaign'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first email campaign to start reaching out to prospects
              </p>
              <Button 
                onClick={createNewCampaign}
                disabled={isCreating}
              >
                <Plus className="w-4 h-4 mr-2" />
                {isCreating ? 'Creating...' : 'Create Your First Campaign'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {campaigns.map((campaign) => (
              <Card key={campaign._id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">
                        {campaign.name}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${campaign.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {campaign.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/campaigns/${campaign._id}/edit`)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteCampaign(campaign._id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <div className="text-sm text-blue-600">Total Contacts</div>
                      <div className="text-2xl font-bold text-blue-700">
                        {campaign.contactCount || 0}
                      </div>
                      <div className="text-xs text-blue-500 mt-1">
                        uploaded directly to campaign
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded border border-green-200">
                      <div className="text-sm text-green-600">Emails Sent</div>
                      <div className="text-2xl font-bold text-green-700">{campaign.stats?.sent || 0}</div>
                      <div className="text-xs text-green-500 mt-1">
                        total emails delivered
                      </div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded border border-purple-200">
                      <div className="text-sm text-purple-600">Open Rate</div>
                      <div className="text-2xl font-bold text-purple-700">
                        {calculateOpenRate(campaign.stats?.opened || 0, campaign.stats?.sent || 0)}%
                      </div>
                      <div className="text-xs text-purple-500 mt-1">
                        emails opened
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center space-x-4">
                      <span>
                        Email Accounts: {campaign.emailAccountIds.length} account{campaign.emailAccountIds.length > 1 ? 's' : ''}
                      </span>
   
                      <span className={`px-2 py-1 rounded text-xs ${campaign.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {campaign.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div>
                      Created: {new Date(campaign.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Campaign Performance Metrics */}
                  {(campaign.stats?.sent || 0) > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Performance Metrics</h4>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex space-x-6">
                          <span className="text-green-600">
                            Open Rate: {calculateOpenRate(campaign.stats?.opened || 0, campaign.stats?.sent || 0)}%
                          </span>
                          <span className="text-blue-600">
                            Click Rate: {campaign.stats?.sent > 0 ? Math.round(((campaign.stats?.clicked || 0) / campaign.stats.sent) * 100) : 0}%
                          </span>
                          <span className="text-purple-600">
                            Reply Rate: {campaign.stats?.sent > 0 ? Math.round(((campaign.stats?.replied || 0) / campaign.stats.sent) * 100) : 0}%
                          </span>
                        </div>
                        <div className="flex space-x-6 text-red-600">
                          <span>Bounced: {campaign.stats.bounced}</span>
                          <span>Unsubscribed: {campaign.stats.unsubscribed}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Coming Soon Notice */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Campaign Builder Coming Soon</CardTitle>
            <CardDescription>
              Full campaign creation with email sequences and personalization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-blue-800 font-medium mb-2">🚧 Campaign Builder In Development</h3>
              <p className="text-blue-700 text-sm">
                The campaign creation interface is currently being built. This will include:
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center text-sm">
                  <span className="text-yellow-600 mr-2">🚧</span>
                  <span>Drag-and-drop email sequence builder</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-yellow-600 mr-2">🚧</span>
                  <span>Email templates with personalization variables</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-yellow-600 mr-2">🚧</span>
                  <span>A/B testing for subject lines and content</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-yellow-600 mr-2">🚧</span>
                  <span>Advanced scheduling and sending controls</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}