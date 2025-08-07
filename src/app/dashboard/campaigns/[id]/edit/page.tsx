'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Plus, Minus, ArrowLeft, Save } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

const sequenceSchema = z.object({
  stepNumber: z.number().min(1),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  delayDays: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  sequences: z.array(sequenceSchema).min(1, 'At least one email sequence is required'),
  listIds: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  schedule: z.object({
    timezone: z.string().default('Asia/Dhaka'),
    sendingHours: z.object({
      start: z.string().default('09:00'),
      end: z.string().default('17:00'),
    }),
    sendingDays: z.array(z.coerce.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    emailDelaySeconds: z.coerce.number().min(1).default(60),
  }),
  trackOpens: z.boolean().default(true),
  trackClicks: z.boolean().default(true),
  unsubscribeLink: z.boolean().default(true),
}).refine(() => {
  // This will be checked in the onSubmit function since email accounts are managed separately
  return true;
}, {
  message: "At least one email account is required"
});

type CampaignForm = z.infer<typeof campaignSchema>;

interface EmailAccount {
  _id: string;
  email: string;
  provider: string;
  fromName?: string;
  replyToEmail?: string;
  isActive: boolean;
}

interface List {
  _id: string;
  name: string;
  contactCount: number;
  isActive: boolean;
  enableAiPersonalization: boolean;
  personalizationPrompt?: string;
}

interface Contact {
  _id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  companyLinkedin?: string;
  tags: string[];
  customFields: { [key: string]: string };
  personalizationData: { [key: string]: string };
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained';
  lastContacted?: Date;
  timesContacted: number;
  additionalField?: string;
}

interface Campaign {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  emailAccountIds: Array<{
    _id: string;
    email: string;
    provider: string;
    fromName?: string;
    replyToEmail?: string;
  }>;
  sequences: Array<{
    stepNumber: number;
    subject: string;
    content: string;
    delayDays: number;
    isActive: boolean;
  }>;
  listIds: Array<{
    _id: string;
    name: string;
    contactCount: number;
    isActive: boolean;
    enableAiPersonalization: boolean;
  }>;
  contacts: Contact[];
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
}

export default function EditCampaignPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [selectedEmailAccounts, setSelectedEmailAccounts] = useState<string[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'sequences',
  });

  const isActive = watch('isActive');

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      // Fetch campaign, email accounts, and lists
      const [campaignRes, emailAccountsRes, listsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/email-accounts', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/lists', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
      ]);

      if (!campaignRes.ok) {
        throw new Error('Failed to fetch campaign');
      }

      if (!emailAccountsRes.ok) {
        throw new Error('Failed to fetch email accounts');
      }

      if (!listsRes.ok) {
        throw new Error('Failed to fetch lists');
      }

      const [campaignData, emailAccountsData, listsData] = await Promise.all([
        campaignRes.json(),
        emailAccountsRes.json(),
        listsRes.json()
      ]);

      const campaign = campaignData.campaign;
      setCampaign(campaign);
      setEmailAccounts(emailAccountsData.emailAccounts.filter((acc: EmailAccount) => acc.isActive));
      setLists(listsData.lists.filter((list: List) => list.isActive));
      
      // Set current email accounts as selected
      setSelectedEmailAccounts(campaign.emailAccountIds.map(acc => acc._id));
      
      // Set current lists as selected - handle both object and string array cases
      let currentListIds: string[] = [];
      if (campaign.listIds) {
        if (Array.isArray(campaign.listIds)) {
          // If listIds contains objects with _id property
          if (campaign.listIds.length > 0 && typeof campaign.listIds[0] === 'object' && '_id' in campaign.listIds[0]) {
            currentListIds = campaign.listIds.map(list => list._id);
          }
          // If listIds is already an array of strings
          else if (campaign.listIds.length > 0 && typeof campaign.listIds[0] === 'string') {
            currentListIds = campaign.listIds as string[];
          }
        }
      }
      setSelectedLists(currentListIds);


      // Reset form with campaign data
      reset({
        name: campaign.name,
        description: campaign.description || '',
        sequences: campaign.sequences,
        listIds: currentListIds,
        isActive: campaign.isActive,
        schedule: campaign.schedule,
        trackOpens: campaign.trackOpens,
        trackClicks: campaign.trackClicks,
        unsubscribeLink: campaign.unsubscribeLink,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };



  const onSubmit = async (data: CampaignForm) => {
    console.log('=== UPDATING CAMPAIGN ===');
    console.log('Form data:', data);
    console.log('Selected email accounts:', selectedEmailAccounts);
    console.log('Selected lists:', selectedLists);
    console.log('Form listIds:', data.listIds);
    console.log('Form errors:', errors);

    // Clear any previous errors
    setError('');

    // Email accounts are optional now
    // if (selectedEmailAccounts.length === 0) {
    //   setError('Please select at least one email account');
    //   return;
    // }

    // Check both selectedLists state and form data listIds
    const listsToUse = selectedLists.length > 0 ? selectedLists : data.listIds;
    // Lists are now optional - campaign can be updated without lists
    // if (!listsToUse || listsToUse.length === 0) {
    //   setError('Please select at least one list');
    //   return;
    // }

    // Validate sequences
    if (!data.sequences || data.sequences.length === 0) {
      setError('Please add at least one email sequence');
      return;
    }

    // Check if any sequence has empty subject or content
    const hasEmptySequence = data.sequences.some(seq => !seq.subject || !seq.content);
    if (hasEmptySequence) {
      setError('All email sequences must have both subject and content');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('token');

    try {
      // Update the existing campaign with all selected email accounts
      console.log('📝 Updating existing campaign with multiple email accounts...');
      const updatePayload = {
        ...data,
        emailAccountIds: selectedEmailAccounts.length > 0 ? selectedEmailAccounts : [],
        listIds: listsToUse || [],
      };
      console.log('Update payload:', updatePayload);

      const updateResponse = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      const updateResult = await updateResponse.json();
      console.log('Update response:', updateResponse.status, updateResult);

      if (!updateResponse.ok) {
        console.error('Failed to update existing campaign:', updateResult);
        throw new Error(updateResult.error || 'Failed to update campaign');
      }

      console.log('✅ Campaign updated successfully with multiple email accounts!');
      router.push('/dashboard/campaigns');
    } catch (err: unknown) {
      console.error('❌ Campaign update error:', err);
      const error = err as Error;
      setError(error.message || 'An error occurred while updating the campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSequence = () => {
    append({
      stepNumber: fields.length + 1,
      subject: '',
      content: '',
      delayDays: fields.length === 0 ? 0 : 3,
      isActive: true,
    });
  };

  const toggleEmailAccountSelection = (accountId: string) => {
    if (selectedEmailAccounts.includes(accountId)) {
      setSelectedEmailAccounts(selectedEmailAccounts.filter(id => id !== accountId));
    } else {
      setSelectedEmailAccounts([...selectedEmailAccounts, accountId]);
    }
  };

  const toggleListSelection = (listId: string) => {
    let newSelectedLists: string[];
    if (selectedLists.includes(listId)) {
      newSelectedLists = selectedLists.filter(id => id !== listId);
    } else {
      newSelectedLists = [...selectedLists, listId];
    }
    setSelectedLists(newSelectedLists);
    setValue('listIds', newSelectedLists);
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Campaign not found</h2>
          <Button onClick={() => router.push('/dashboard/campaigns')}>
            Back to Campaigns
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center mb-6">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/campaigns')}
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaigns
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Campaign</h1>
            <p className="text-gray-600 mt-2">
              Update your campaign settings and email sequences
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Campaign Details */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>
                Basic information about your campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign Name *
                  </label>
                  <Input
                    {...register('name')}
                    className={errors.name ? 'border-red-500' : ''}
                    placeholder="My Email Campaign"
                  />
                  {errors.name && (
                    <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Campaign Status
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-medium text-gray-600">
                        Inactive
                      </span>
                      <ToggleSwitch
                        checked={isActive || false}
                        onCheckedChange={(checked) => setValue('isActive', checked)}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-green-600">
                        Active
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {isActive ? 'Campaign is active and can send emails' : 'Campaign is inactive and will not send emails'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Campaign description..."
                />
              </div>

              {/* Email Account Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Accounts (Optional - Select multiple to create additional campaigns)
                </label>
                {emailAccounts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">No email accounts available</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push('/dashboard/email-accounts')}
                    >
                      Add Email Accounts First
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-50 overflow-y-auto border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">
                        {selectedEmailAccounts.length} of {emailAccounts.length} accounts selected
                      </span>
                      <div className="space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedEmailAccounts(emailAccounts.map(acc => acc._id))}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedEmailAccounts([])}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    
                    {emailAccounts.map((account) => (
                      <div key={account._id} className={`flex items-center space-x-3 p-2 border rounded ${selectedEmailAccounts.includes(account._id) ? 'border-blue-300 bg-blue-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedEmailAccounts.includes(account._id)}
                          onChange={() => toggleEmailAccountSelection(account._id)}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <div className="font-medium">
                            {account.email} ({account.provider})
                            {campaign && campaign.emailAccountIds.some(acc => acc._id === account._id) && (
                              <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            From: {account.fromName || 'Not set'} | Reply-To: {account.replyToEmail || account.email}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {selectedEmailAccounts.length > 1 && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                        <strong>Note:</strong> This campaign will use all {selectedEmailAccounts.length} selected email accounts 
                        for sending emails.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* List Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Lists (Optional - Select lists to target for this campaign)
                </label>
                {lists.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">No lists available</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push('/dashboard/lists')}
                    >
                      Create Lists First
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-50 overflow-y-auto border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">
                        {selectedLists.length} of {lists.length} lists selected
                      </span>
                      <div className="space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allListIds = lists.map(list => list._id);
                            setSelectedLists(allListIds);
                            setValue('listIds', allListIds);
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedLists([]);
                            setValue('listIds', []);
                          }}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    
                    {lists.map((list) => {
                      const isSelected = selectedLists.includes(list._id);
                      return (
                        <div key={list._id} className={`flex items-center space-x-3 p-2 border rounded ${isSelected ? 'border-green-300 bg-green-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleListSelection(list._id)}
                            className="rounded"
                          />
                        <div className="flex-1">
                          <div className="font-medium">
                            {list.name}
                            {campaign && campaign.listIds && campaign.listIds.some(l => (typeof l === 'object' ? l._id : l) === list._id) && (
                              <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {list.contactCount} contacts
                            {list.enableAiPersonalization && (
                              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                AI Personalization
                              </span>
                            )}
                          </div>
                        </div>
                        </div>
                      );
                    })}
                    
                    {selectedLists.length > 1 && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                        <strong>Note:</strong> This campaign will target contacts from all {selectedLists.length} selected lists.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Email Sequences */}
          <Card>
            <CardHeader>
              <CardTitle>Email Sequences</CardTitle>
              <CardDescription>
                Update your email sequence with personalized messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((field, index) => (
                <div key={field.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Email #{index + 1}</h4>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delay (days)
                    </label>
                    <Input
                      type="number"
                      {...register(`sequences.${index}.delayDays`)}
                      min="0"
                      placeholder="0"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject Line *
                    </label>
                    <Input
                      {...register(`sequences.${index}.subject`)}
                      placeholder="Quick question about {{company}}"
                      className="w-full"
                    />
                    {errors.sequences?.[index]?.subject && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.subject?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Content *
                    </label>
                    <textarea
                      {...register(`sequences.${index}.content`)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={6}
                      placeholder={`Hi {{firstName}},

I noticed {{company}} is doing great work in the industry.

I'd love to show you how we can help you achieve even better results.

Would you be open to a quick 15-minute call this week?

Best regards,
{{fromName}}`}
                    />
                    {errors.sequences?.[index]?.content && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.content?.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      {...register(`sequences.${index}.isActive`)}
                      className="rounded"
                    />
                    <label className="text-sm text-gray-700">
                      This email sequence is active
                    </label>
                  </div>

                  <div className="text-xs text-gray-500">
                    <p><strong>Available variables:</strong> {'{{firstName}}'}, {'{{lastName}}'}, {'{{company}}'}, {'{{position}}'}, {'{{phone}}'}, {'{{website}}'}, {'{{linkedin}}'}, {'{{fromName}}'}, {'{{personalization}}'}</p>
                    <p><strong>Personalization:</strong> Use {'{{personalization}}'} to include the AI-generated personalization from the contact&apos;s database entry.</p>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addSequence}>
                <Plus className="w-4 h-4 mr-2" />
                Add Follow-up Email
              </Button>
            </CardContent>
          </Card>



          {/* Schedule Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule Settings</CardTitle>
              <CardDescription>
                Configure when and how often to send emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  {...register('schedule.timezone')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="Asia/Dhaka">Asia/Dhaka (UTC+6)</option>
                  <option value="UTC">UTC (UTC+0)</option>
                  <option value="America/New_York">America/New_York (UTC-5)</option>
                  <option value="Europe/London">Europe/London (UTC+0)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                  <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send Start Time
                  </label>
                  <Input
                    type="time"
                    {...register('schedule.sendingHours.start')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send End Time
                  </label>
                  <Input
                    type="time"
                    {...register('schedule.sendingHours.end')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sending Days
                </label>
                <div className="flex space-x-4">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                    // Fix Sunday mapping: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
                    const dayValue = index === 6 ? 0 : index + 1;
                    const sendingDays = watch('schedule.sendingDays') || [];
                    const isChecked = sendingDays.includes(dayValue);
                    
                    return (
                      <label key={index} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const currentDays = watch('schedule.sendingDays') || [];
                            if (e.target.checked) {
                              setValue('schedule.sendingDays', [...currentDays, dayValue]);
                            } else {
                              setValue('schedule.sendingDays', currentDays.filter(d => d !== dayValue));
                            }
                          }}
                          className="rounded mr-2"
                        />
                        {day}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay between each emails in seconds
                </label>
                <Input
                  type="number"
                  {...register('schedule.emailDelaySeconds')}
                  min="1"
                  placeholder="60"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum delay between sending emails to different recipients (default: 60 seconds)
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('trackOpens')}
                    className="rounded mr-2"
                  />
                  <label className="text-sm">Track email opens</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('trackClicks')}
                    className="rounded mr-2"
                  />
                  <label className="text-sm">Track link clicks</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('unsubscribeLink')}
                    className="rounded mr-2"
                  />
                  <label className="text-sm">Include unsubscribe link</label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/campaigns')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={
                isSubmitting ||
                Object.keys(errors).length > 0
              }
            >
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Updating Campaign...' : 'Update Campaign'}
            </Button>
          </div>
          
          {/* Form Validation Status - Removed list requirement */}
        </form>
      </div>
    </div>
  );
}