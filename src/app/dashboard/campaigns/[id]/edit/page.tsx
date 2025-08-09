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
import { Plus, Minus, ArrowLeft, Save, Upload } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

const sequenceSchema = z.object({
  stepNumber: z.number().min(1),
  subject: z.string().optional(),
  content: z.string().optional(),
  delayDays: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  useAiForSubject: z.boolean().default(false),
  aiSubjectPrompt: z.string().optional(),
  useAiForContent: z.boolean().default(false),
  aiContentPrompt: z.string().optional(),
}).refine((data) => {
  // Subject is required if not using AI for subject
  if (!data.useAiForSubject && (!data.subject || data.subject.trim().length === 0)) {
    return false;
  }
  // AI subject prompt is required if using AI for subject
  if (data.useAiForSubject && (!data.aiSubjectPrompt || data.aiSubjectPrompt.trim().length === 0)) {
    return false;
  }
  // Content is required if not using AI for content
  if (!data.useAiForContent && (!data.content || data.content.trim().length === 0)) {
    return false;
  }
  // AI content prompt is required if using AI for content
  if (data.useAiForContent && (!data.aiContentPrompt || data.aiContentPrompt.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Please fill in required fields based on your AI/manual selection",
});

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  sequences: z.array(sequenceSchema).min(1, 'At least one email sequence is required'),
  isActive: z.boolean().default(true),
  schedule: z.object({
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
  campaignId?: string;
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
    useAiForSubject?: boolean;
    aiSubjectPrompt?: string;
    useAiForContent?: boolean;
    aiContentPrompt?: string;
  }>;
  contactCount: number;
  schedule: {
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
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedContacts, setUploadedContacts] = useState<Contact[]>([]);
  const [message, setMessage] = useState('');
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
      // Fetch campaign and email accounts
      const [campaignRes, emailAccountsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/email-accounts', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
      ]);

      if (!campaignRes.ok) {
        throw new Error('Failed to fetch campaign');
      }

      if (!emailAccountsRes.ok) {
        throw new Error('Failed to fetch email accounts');
      }


      const [campaignData, emailAccountsData] = await Promise.all([
        campaignRes.json(),
        emailAccountsRes.json()
      ]);

      const campaign = campaignData.campaign;
      setCampaign(campaign);
      setEmailAccounts(emailAccountsData.emailAccounts.filter((acc: EmailAccount) => acc.isActive));
      
      // Set current email accounts as selected
      setSelectedEmailAccounts(campaign.emailAccountIds.map(acc => acc._id));
      
      // Campaign contact count is now handled via contactCount field


      // Reset form with campaign data
      reset({
        name: campaign.name,
        description: campaign.description || '',
        sequences: campaign.sequences,
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



  const parseCSVLine = (line: string): string[] => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const autoMapColumns = (csvColumns: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    
    const exactMatches: Record<string, string> = {
      'Email': 'email',
      'First Name': 'firstName', 
      'Last Name': 'lastName',
      'Company': 'company',
      'Company Name for Emails': 'company',
      'Title': 'position',
      'Seniority': 'position',
      'City': 'city',
      'Company City': 'city',
      'State': 'state',
      'Company State': 'state',
      'Country': 'country',
      'Company Country': 'country',
      'Industry': 'industry',
      'Annual Revenue': 'revenue',
      '# Employees': 'employees',
      'Mobile Phone': 'phone',
      'Work Direct Phone': 'phone',
      'Corporate Phone': 'phone',
      'Company Phone': 'phone',
      'Home Phone': 'phone',
      'Other Phone': 'phone',
      'Website': 'website',
      'Person Linkedin Url': 'linkedin',
      'Company Linkedin Url': 'linkedin',
    };

    csvColumns.forEach(csvCol => {
      if (exactMatches[csvCol]) {
        mapping[exactMatches[csvCol]] = csvCol;
      }
    });

    const fieldMappings = {
      'email': ['email', 'primary email', 'secondary email', 'tertiary email', 'work email', 'contact email', 'e-mail'],
      'firstName': ['first name', 'firstname', 'first_name', 'fname', 'given name'],
      'lastName': ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'],
      'company': ['company', 'company name', 'organization', 'employer', 'business', 'company name for emails'],
      'position': ['title', 'position', 'job title', 'role', 'designation', 'seniority'],
      'phone': ['phone', 'mobile phone', 'work direct phone', 'corporate phone', 'contact phone', 'telephone', 'home phone', 'other phone', 'company phone'],
      'website': ['website', 'company website', 'web site', 'url', 'domain'],
      'linkedin': ['person linkedin url', 'company linkedin url', 'linkedin', 'linkedin url', 'linkedin profile'],
      'city': ['city', 'company city', 'location'],
      'state': ['state', 'company state', 'province', 'region'],
      'country': ['country', 'company country', 'nation'],
      'industry': ['industry', 'sector', 'business type', 'departments'],
      'revenue': ['annual revenue', 'revenue', 'company revenue', 'total funding', 'latest funding amount'],
      'employees': ['# employees', 'employees', 'company size', 'headcount', 'number of retail locations'],
    };

    csvColumns.forEach(csvCol => {
      const normalizedCsvCol = csvCol.toLowerCase().trim();
      
      for (const [contactField, variations] of Object.entries(fieldMappings)) {
        if (mapping[contactField]) continue;
        
        if (variations.some(variation => normalizedCsvCol.includes(variation))) {
          mapping[contactField] = csvCol;
          break;
        }
      }
    });

    return mapping;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage('');
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvContent = event.target?.result as string;
      setCsvData(csvContent);
      
      const lines = csvContent.trim().split('\n');
      if (lines.length > 0) {
        const headers = parseCSVLine(lines[0]);
        setDetectedColumns(headers);
        setColumnMapping(autoMapColumns(headers));
      }
      
      setShowUploadForm(true);
    };
    
    reader.readAsText(file);
  };

  const handleUploadContacts = async () => {
    if (!csvData) return;

    setIsUploading(true);
    setError('');

    try {
      const lines = csvData.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }

      const headers = parseCSVLine(lines[0]);
      const contacts = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        const contact: any = {};

        Object.entries(columnMapping).forEach(([contactField, csvColumn]) => {
          const columnIndex = headers.findIndex(h => h === csvColumn);
          if (columnIndex !== -1 && columnIndex < values.length && values[columnIndex]) {
            contact[contactField] = values[columnIndex];
          }
        });

        if (contact.email && contact.email.includes('@')) {
          contacts.push(contact);
        }
      }

      if (contacts.length === 0) {
        throw new Error('No valid contacts found with email addresses');
      }

      const token = localStorage.getItem('token');
      console.log('Importing contacts:', { contactsCount: contacts.length, campaignId });
      
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          contacts,
          campaignId: campaignId
        }),
      });

      console.log('Import response status:', response.status);
      console.log('Import response headers:', response.headers);

      if (!response.ok) {
        console.error('Import failed with status:', response.status);
        const responseText = await response.text();
        console.error('Response text:', responseText);
        
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Import failed with status ${response.status}. Response: ${responseText}`);
        }
        throw new Error(errorData.error || 'Failed to import contacts');
      }

      const responseText = await response.text();
      console.log('Success response text:', responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse JSON response:', responseText);
        throw new Error('Invalid response format from server');
      }
      
      if (responseData.contacts) {
        const newContactsCount = responseData.contacts.length;
        const previousContactCount = campaign?.contactCount || 0;
        const totalContactsNow = previousContactCount + newContactsCount;
        const duplicatesCount = responseData.errors ? responseData.errors.filter(error => error.includes('already exists')).length : 0;
        const processedCount = responseData.total || contacts.length;
        
        setUploadedContacts(responseData.contacts);
        
        // Build detailed success message
        let detailedMessage = `CSV Import Complete!\n`;
        detailedMessage += `✅ ${newContactsCount} new contacts added successfully\n`;
        if (duplicatesCount > 0) {
          detailedMessage += `⚠️ ${duplicatesCount} contacts were already existing (skipped)\n`;
        }
        detailedMessage += `📊 Total contacts processed: ${processedCount}\n`;
        detailedMessage += `🎯 Total contacts in campaign now: ${totalContactsNow}`;
        
        setMessage(detailedMessage);
      }
      
      setShowUploadForm(false);
      setCsvFile(null);
      setCsvData('');
      setColumnMapping({});
      setDetectedColumns([]);
      
      // Refresh campaign data to update contact count
      await fetchData();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadCancel = () => {
    setShowUploadForm(false);
    setCsvFile(null);
    setCsvData('');
    setColumnMapping({});
    setDetectedColumns([]);
  };

  const onSubmit = async (data: CampaignForm) => {
    console.log('=== UPDATING CAMPAIGN ===');
    console.log('Form data:', data);
    console.log('Selected email accounts:', selectedEmailAccounts);
    console.log('Uploaded contacts:', uploadedContacts);
    console.log('Form errors:', errors);

    // Clear any previous errors
    setError('');

    // Email accounts are optional now
    // if (selectedEmailAccounts.length === 0) {
    //   setError('Please select at least one email account');
    //   return;
    // }

    // Contacts are optional - campaigns can be updated without contacts

    // Validate sequences
    if (!data.sequences || data.sequences.length === 0) {
      setError('Please add at least one email sequence');
      return;
    }

    // Check if any sequence has missing required fields based on AI/manual mode
    const hasInvalidSequence = data.sequences.some(seq => {
      // Check subject requirements
      if (!seq.useAiForSubject && (!seq.subject || seq.subject.trim().length === 0)) {
        return true; // Missing manual subject
      }
      if (seq.useAiForSubject && (!seq.aiSubjectPrompt || seq.aiSubjectPrompt.trim().length === 0)) {
        return true; // Missing AI subject prompt
      }
      
      // Check content requirements
      if (!seq.useAiForContent && (!seq.content || seq.content.trim().length === 0)) {
        return true; // Missing manual content
      }
      if (seq.useAiForContent && (!seq.aiContentPrompt || seq.aiContentPrompt.trim().length === 0)) {
        return true; // Missing AI content prompt
      }
      
      return false;
    });
    
    if (hasInvalidSequence) {
      setError('Please fill in all required fields for each email sequence based on your AI/manual selection');
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
      useAiForSubject: false,
      aiSubjectPrompt: '',
      useAiForContent: false,
      aiContentPrompt: '',
    });
  };

  const toggleEmailAccountSelection = (accountId: string) => {
    if (selectedEmailAccounts.includes(accountId)) {
      setSelectedEmailAccounts(selectedEmailAccounts.filter(id => id !== accountId));
    } else {
      setSelectedEmailAccounts([...selectedEmailAccounts, accountId]);
    }
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

              {/* CSV Upload Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Upload CSV Contacts
                  </label>
                  {campaign?.contactCount && campaign.contactCount > 0 && (
                    <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {campaign.contactCount} contacts already added
                    </span>
                  )}
                </div>
                {uploadedContacts.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <div className="space-y-2">
                      <div className="text-gray-500">
                        <Upload className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm">Upload a CSV file with your contacts</p>
                      </div>
                      <label htmlFor="csv-upload" className="cursor-pointer">
                        <Button type="button" variant="outline" asChild>
                          <span>Choose CSV File</span>
                        </Button>
                      </label>
                      <input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold text-green-700">
                          {uploadedContacts.length} contacts ready
                        </div>
                        <div className="text-sm text-green-600">
                          Contacts have been uploaded and will be used for this campaign
                        </div>
                      </div>
                      <div className="space-x-2">
                        <label htmlFor="csv-upload-replace" className="cursor-pointer">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <span>Replace CSV</span>
                          </Button>
                        </label>
                        <input
                          id="csv-upload-replace"
                          type="file"
                          accept=".csv"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upload CSV Form */}
          {showUploadForm && (
            <Card>
              <CardHeader>
                <CardTitle>Import Contacts from CSV</CardTitle>
                <CardDescription>
                  Review and adjust column mappings before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* File Info */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <p className="text-sm font-medium text-gray-700">
                      File: {csvFile?.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Detected {detectedColumns.length} columns
                    </p>
                  </div>

                  {/* Column Mapping */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Column Mapping</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        { key: 'email', label: 'Email *', required: true },
                        { key: 'firstName', label: 'First Name' },
                        { key: 'lastName', label: 'Last Name' },
                        { key: 'company', label: 'Company' },
                        { key: 'position', label: 'Position/Title' },
                        { key: 'phone', label: 'Phone' },
                        { key: 'website', label: 'Website' },
                        { key: 'linkedin', label: 'LinkedIn' },
                        { key: 'city', label: 'City' },
                        { key: 'state', label: 'State' },
                        { key: 'country', label: 'Country' },
                        { key: 'industry', label: 'Industry' },
                        { key: 'revenue', label: 'Annual Revenue' },
                        { key: 'employees', label: '# of Employees' },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {field.label}
                          </label>
                          <select
                            value={columnMapping[field.key] || ''}
                            onChange={(e) => setColumnMapping({
                              ...columnMapping,
                              [field.key]: e.target.value
                            })}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            required={field.required}
                          >
                            <option value="">-- Skip this field --</option>
                            {detectedColumns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  {csvData && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Preview (First 3 rows)</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm border">
                          <thead>
                            <tr className="bg-gray-50">
                              {Object.entries(columnMapping)
                                .filter(([, csvCol]) => csvCol)
                                .map(([contactField, csvCol]) => (
                                  <th key={contactField} className="p-2 text-left border-b font-medium">
                                    {contactField} ← {csvCol}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvData.trim().split('\n').slice(1, 4).map((line, index) => {
                              if (!line.trim()) return null;
                              const values = parseCSVLine(line);
                              const headers = parseCSVLine(csvData.trim().split('\n')[0]);
                              
                              return (
                                <tr key={index} className="border-b">
                                  {Object.entries(columnMapping)
                                    .filter(([, csvCol]) => csvCol)
                                    .map(([contactField, csvCol]) => {
                                      const colIndex = headers.findIndex(h => h === csvCol);
                                      return (
                                        <td key={contactField} className="p-2 border-b">
                                          {values[colIndex] || '-'}
                                        </td>
                                      );
                                    })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-2">
                    <Button 
                      type="button"
                      onClick={handleUploadContacts} 
                      disabled={isUploading || !columnMapping.email}
                    >
                      {isUploading ? 'Importing...' : 'Import Contacts'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleUploadCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CSV Import Status Message */}
          {message && (
            <div className={`p-4 rounded-md ${
              message.includes('success') || message.includes('Successfully') || message.includes('imported') || message.includes('CSV Import Complete')
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <pre className="whitespace-pre-wrap font-sans text-sm">{message}</pre>
            </div>
          )}

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
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Subject Line *
                      </label>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-medium text-gray-600">
                          Manual
                        </span>
                        <ToggleSwitch
                          checked={watch(`sequences.${index}.useAiForSubject`) === true}
                          onCheckedChange={(checked) => setValue(`sequences.${index}.useAiForSubject`, checked)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-blue-600">
                          AI
                        </span>
                      </div>
                    </div>
                    
                    {watch(`sequences.${index}.useAiForSubject`) === true ? (
                      <div className="space-y-2">
                        <Input
                          {...register(`sequences.${index}.aiSubjectPrompt`)}
                          placeholder="Write a compelling subject line about..."
                          className="w-full"
                        />
                        <p className="text-xs text-gray-500">AI will use this prompt to generate the subject line when sending emails</p>
                      </div>
                    ) : (
                      <Input
                        {...register(`sequences.${index}.subject`)}
                        placeholder="Quick question about {{company}}"
                        className="w-full"
                      />
                    )}
                    
                    {errors.sequences?.[index]?.subject && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.subject?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Email Content *
                      </label>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-medium text-gray-600">
                          Manual
                        </span>
                        <ToggleSwitch
                          checked={watch(`sequences.${index}.useAiForContent`) === true}
                          onCheckedChange={(checked) => setValue(`sequences.${index}.useAiForContent`, checked)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-blue-600">
                          AI
                        </span>
                      </div>
                    </div>
                    
                    {watch(`sequences.${index}.useAiForContent`) === true ? (
                      <div className="space-y-2">
                        <textarea
                          {...register(`sequences.${index}.aiContentPrompt`)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          rows={4}
                          placeholder="Write a personalized cold email that introduces our service and requests a meeting..."
                        />
                        <p className="text-xs text-gray-500">AI will use this prompt to generate the email content when sending emails</p>
                      </div>
                    ) : (
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
                    )}
                    
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