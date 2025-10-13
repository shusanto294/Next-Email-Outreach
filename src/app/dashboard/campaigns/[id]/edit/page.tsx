'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  // Email fields directly in campaign
  subject: z.string().optional(),
  content: z.string().optional(),
  useAiForSubject: z.boolean().default(false),
  aiSubjectPrompt: z.string().optional(),
  useAiForContent: z.boolean().default(false),
  aiContentPrompt: z.string().optional(),
  isActive: z.boolean().default(true),
  emailAccountIds: z.array(z.string()).default([]),
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
  isActive: boolean;
  emailAccountIds: Array<{
    _id: string;
    email: string;
    provider: string;
    fromName?: string;
    replyToEmail?: string;
  }>;
  // Email fields directly in campaign
  subject?: string;
  content?: string;
  useAiForSubject?: boolean;
  aiSubjectPrompt?: string;
  useAiForContent?: boolean;
  aiContentPrompt?: string;
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
  const [campaignContacts, setCampaignContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [activeTab, setActiveTab] = useState<'details' | 'email' | 'contacts' | 'schedule' | 'launch'>('details');

  const CONTACTS_PER_PAGE = 10;

  const tabOrder: ('details' | 'email' | 'contacts' | 'schedule' | 'launch')[] = ['details', 'email', 'contacts', 'schedule', 'launch'];
  const currentTabIndex = tabOrder.indexOf(activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === tabOrder.length - 1;

  const goToNextTab = () => {
    if (!isLastTab) {
      setActiveTab(tabOrder[currentTabIndex + 1]);
    }
  };

  const goToPreviousTab = () => {
    if (!isFirstTab) {
      setActiveTab(tabOrder[currentTabIndex - 1]);
    }
  };
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

  const isActive = watch('isActive');

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  // Fetch contacts when switching to contacts tab or when campaign is loaded
  useEffect(() => {
    if (activeTab === 'contacts' && campaign) {
      fetchCampaignContacts(1);
    }
  }, [activeTab, campaign]);

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

      const fetchedCampaign: Campaign = campaignData.campaign;
      setCampaign(fetchedCampaign);
      setEmailAccounts(emailAccountsData.emailAccounts.filter((acc: EmailAccount) => acc.isActive));
      
      // Set current email accounts as selected
      setSelectedEmailAccounts(fetchedCampaign.emailAccountIds.map((acc) => acc._id));
      
      // Campaign contact count is now handled via contactCount field


      // Reset form with campaign data
      reset({
        name: fetchedCampaign.name,
        subject: fetchedCampaign.subject || '',
        content: fetchedCampaign.content || '',
        useAiForSubject: fetchedCampaign.useAiForSubject || false,
        aiSubjectPrompt: fetchedCampaign.aiSubjectPrompt || '',
        useAiForContent: fetchedCampaign.useAiForContent || false,
        aiContentPrompt: fetchedCampaign.aiContentPrompt || '',
        isActive: fetchedCampaign.isActive,
        emailAccountIds: fetchedCampaign.emailAccountIds.map((acc) => acc._id),
        schedule: fetchedCampaign.schedule,
        trackOpens: fetchedCampaign.trackOpens,
        trackClicks: fetchedCampaign.trackClicks,
        unsubscribeLink: fetchedCampaign.unsubscribeLink,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshCampaignData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const campaignRes = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (campaignRes.ok) {
        const campaignData = await campaignRes.json();
        const campaign = campaignData.campaign;
        setCampaign(campaign);
        // Don't reset form or selectedEmailAccounts - just update campaign data
      }
    } catch (error) {
      console.error('Error refreshing campaign data:', error);
    }
  };

  const fetchCampaignContacts = async (page: number = 1) => {
    if (!campaign) return;
    
    setContactsLoading(true);
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch(
        `/api/contacts?campaignId=${campaignId}&page=${page}&limit=${CONTACTS_PER_PAGE}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCampaignContacts(data.contacts || []);
        setTotalContacts(data.pagination?.total || 0);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Error fetching campaign contacts:', error);
    } finally {
      setContactsLoading(false);
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
      // Switch to contacts tab when CSV is uploaded
      setActiveTab('contacts');
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
        const duplicatesCount = responseData.errors ? responseData.errors.filter((error: string) => error.includes('already exists')).length : 0;
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
      
      // Refresh campaign data to update contact count (without resetting form)
      await refreshCampaignData();
      // Refresh contact list if on contacts tab
      if (activeTab === 'contacts') {
        await fetchCampaignContacts(currentPage);
      }
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

    // Clear any previous errors
    setError('');

    // Email accounts are optional now
    // if (selectedEmailAccounts.length === 0) {
    //   setError('Please select at least one email account');
    //   return;
    // }

    // Only validate email if we're on the email tab or final submission
    if (activeTab === 'email' || isLastTab) {
      // Check subject requirements
      if (!data.useAiForSubject && (!data.subject || data.subject.trim().length === 0)) {
        setError('Please provide a subject line or enable AI for subject generation');
        return;
      }
      if (data.useAiForSubject && (!data.aiSubjectPrompt || data.aiSubjectPrompt.trim().length === 0)) {
        setError('Please provide an AI prompt for subject generation');
        return;
      }

      // Check content requirements
      if (!data.useAiForContent && (!data.content || data.content.trim().length === 0)) {
        setError('Please provide email body content or enable AI for content generation');
        return;
      }
      if (data.useAiForContent && (!data.aiContentPrompt || data.aiContentPrompt.trim().length === 0)) {
        setError('Please provide an AI prompt for content generation');
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('token');

    try {
      // Update the existing campaign with all selected email accounts
      const updatePayload = {
        ...data,
        // emailAccountIds should already be in data now, but keep as fallback
        emailAccountIds: data.emailAccountIds || selectedEmailAccounts || [],
      };

      const updateResponse = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      const updateResult = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateResult.error || 'Failed to update campaign');
      }

      // If this is the last tab, redirect to campaigns list
      // Otherwise, go to the next tab
      if (isLastTab) {
        router.push('/dashboard/campaigns');
      } else {
        goToNextTab();
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'An error occurred while updating the campaign');
    } finally {
      setIsSubmitting(false);
    }
  };


  const toggleEmailAccountSelection = (accountId: string) => {
    let newSelectedAccounts;
    if (selectedEmailAccounts.includes(accountId)) {
      newSelectedAccounts = selectedEmailAccounts.filter(id => id !== accountId);
    } else {
      newSelectedAccounts = [...selectedEmailAccounts, accountId];
    }
    
    setSelectedEmailAccounts(newSelectedAccounts);
    // Also update the form data to keep it in sync
    setValue('emailAccountIds', newSelectedAccounts);
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Campaign</h1>
            <p className="text-gray-600 mt-2">
              Update your campaign settings and email sequences
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/campaigns')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaigns
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Tab Navigation with Progress */}
        <div className="border-b border-gray-200 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-500">
              Step {currentTabIndex + 1} of {tabOrder.length}
            </div>
            <div className="flex space-x-2">
              {tabOrder.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index <= currentTabIndex ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
          <nav className="flex space-x-8">
            {[
              { key: 'details', label: 'Campaign Details' },
              { key: 'email', label: 'Email' },
              { key: 'contacts', label: 'Contacts', badge: campaign?.contactCount },
              { key: 'schedule', label: 'Schedule Settings' },
              { key: 'launch', label: 'Launch' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Campaign Details Tab */}
          {activeTab === 'details' && (
            <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>
                Basic information about your campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
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
                  <div className="space-y-2 border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">
                        {selectedEmailAccounts.length} of {emailAccounts.length} accounts selected
                      </span>
                      <div className="space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allAccountIds = emailAccounts.map(acc => acc._id);
                            setSelectedEmailAccounts(allAccountIds);
                            setValue('emailAccountIds', allAccountIds);
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedEmailAccounts([]);
                            setValue('emailAccountIds', []);
                          }}
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
                        <strong>Note:</strong> This campaign will use all {selectedEmailAccounts.length} selected email accounts for sending emails.
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            </CardContent>
            </Card>
          )}

        {/* Contacts Tab */}
          {activeTab === 'contacts' && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Contacts</CardTitle>
              <CardDescription>
                Manage and upload contacts for your campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

              {/* Campaign Contacts List */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Campaign Contacts</h3>
                  <div className="text-sm text-gray-500">
                    {totalContacts} contact{totalContacts !== 1 ? 's' : ''} total
                  </div>
                </div>

                {contactsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-gray-500">Loading contacts...</div>
                  </div>
                ) : campaignContacts.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-500">No contacts found for this campaign.</div>
                    <p className="text-sm text-gray-400 mt-1">Upload a CSV file to add contacts.</p>
                  </div>
                ) : (
                  <>
                    {/* Contacts Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Contact
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Company
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Position
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {campaignContacts.map((contact) => (
                            <tr key={contact._id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {contact.firstName || contact.lastName 
                                      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                                      : 'N/A'}
                                  </div>
                                  <div className="text-sm text-gray-500">{contact.email}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {contact.company || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {contact.position || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  contact.status === 'active' 
                                    ? 'bg-green-100 text-green-800'
                                    : contact.status === 'unsubscribed'
                                    ? 'bg-red-100 text-red-800'
                                    : contact.status === 'bounced'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {contact.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-700">
                        Showing {((currentPage - 1) * CONTACTS_PER_PAGE) + 1} to {Math.min(currentPage * CONTACTS_PER_PAGE, totalContacts)} of {totalContacts} contacts
                      </div>
                      
                      {Math.ceil(totalContacts / CONTACTS_PER_PAGE) > 1 && (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchCampaignContacts(currentPage - 1)}
                            disabled={currentPage === 1 || contactsLoading}
                          >
                            Previous
                          </Button>
                          
                          <div className="flex items-center space-x-1">
                            {(() => {
                              const totalPages = Math.ceil(totalContacts / CONTACTS_PER_PAGE);
                              const pages = [];
                              
                              if (totalPages <= 6) {
                                // Show all pages if 6 or fewer
                                for (let i = 1; i <= totalPages; i++) {
                                  pages.push(i);
                                }
                              } else {
                                // Show first page, current page ±1, and last page with ellipsis
                                if (currentPage <= 3) {
                                  pages.push(1, 2, 3, 4);
                                  if (totalPages > 4) pages.push('...');
                                  if (totalPages > 5) pages.push(totalPages);
                                } else if (currentPage >= totalPages - 2) {
                                  pages.push(1);
                                  if (totalPages > 4) pages.push('...');
                                  for (let i = totalPages - 3; i <= totalPages; i++) {
                                    pages.push(i);
                                  }
                                } else {
                                  pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                                }
                              }
                              
                              return pages.map((page, index) => 
                                page === '...' ? (
                                  <span key={`ellipsis-${index}`} className="text-gray-400 px-2">...</span>
                                ) : (
                                  <Button
                                    key={`page-${page}`}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => fetchCampaignContacts(page as number)}
                                    disabled={contactsLoading}
                                    className="w-8 h-8 p-0"
                                  >
                                    {page}
                                  </Button>
                                )
                              );
                            })()}
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchCampaignContacts(currentPage + 1)}
                            disabled={currentPage >= Math.ceil(totalContacts / CONTACTS_PER_PAGE) || contactsLoading}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Email Tab */}
          {activeTab === 'email' && (
          <Card>
            <CardHeader>
              <CardTitle>Email Composer</CardTitle>
              <CardDescription>
                Compose your email with subject line and body
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border rounded-lg p-4 space-y-4">
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
                        checked={watch('useAiForSubject') === true}
                        onCheckedChange={(checked) => setValue('useAiForSubject', checked)}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-blue-600">
                        AI
                      </span>
                    </div>
                  </div>

                  {watch('useAiForSubject') === true ? (
                    <div className="space-y-2">
                      <textarea
                        {...register('aiSubjectPrompt')}
                        placeholder="Write a compelling subject line about..."
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={3}
                      />
                      <p className="text-xs text-gray-500">AI will use this prompt to generate the subject line when sending emails</p>
                    </div>
                  ) : (
                    <Input
                      {...register('subject')}
                      placeholder="Quick question about {{company}}"
                      className="w-full"
                    />
                  )}

                  {errors.subject && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.subject.message}
                    </p>
                  )}
                  {errors.aiSubjectPrompt && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.aiSubjectPrompt.message}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Email Body *
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-medium text-gray-600">
                        Manual
                      </span>
                      <ToggleSwitch
                        checked={watch('useAiForContent') === true}
                        onCheckedChange={(checked) => setValue('useAiForContent', checked)}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-blue-600">
                        AI
                      </span>
                    </div>
                  </div>

                  {watch('useAiForContent') === true ? (
                    <div className="space-y-2">
                      <textarea
                        {...register('aiContentPrompt')}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={4}
                        placeholder="Write a personalized cold email that introduces our service and requests a meeting..."
                      />
                      <p className="text-xs text-gray-500">AI will use this prompt to generate the email content when sending emails</p>
                    </div>
                  ) : (
                    <textarea
                      {...register('content')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={10}
                      placeholder={`Hi {{firstName}},

I noticed {{company}} is doing great work in the industry.

I'd love to show you how we can help you achieve even better results.

Would you be open to a quick 15-minute call this week?

Best regards,
{{fromName}}`}
                    />
                  )}

                  {errors.content && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.content.message}
                    </p>
                  )}
                  {errors.aiContentPrompt && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.aiContentPrompt.message}
                    </p>
                  )}
                </div>

                <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                  <p><strong>Available variables:</strong> {'{{firstName}}'}, {'{{lastName}}'}, {'{{company}}'}, {'{{position}}'}, {'{{phone}}'}, {'{{website}}'}, {'{{linkedin}}'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Schedule Settings Tab */}
          {activeTab === 'schedule' && (
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
          )}

          {/* Launch Tab */}
          {activeTab === 'launch' && (
          <Card>
            <CardHeader>
              <CardTitle>Launch Campaign</CardTitle>
              <CardDescription>
                Configure campaign status and mode before launching
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                      checked={watch('isActive') || false}
                      onCheckedChange={(checked) => setValue('isActive', checked)}
                      size="sm"
                    />
                    <span className="text-xs font-medium text-green-600">
                      Active
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  {watch('isActive') ? 'Campaign is active and can send emails' : 'Campaign is inactive and will not send emails'}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Campaign Summary</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• Email composed and ready to send</p>
                  <p>• <strong>{campaign?.contactCount || 0}</strong> contacts targeted</p>
                  <p>• <strong>{selectedEmailAccounts.length}</strong> email accounts selected</p>
                  <p>• Status: <strong className={watch('isActive') ? 'text-green-600' : 'text-orange-600'}>
                    {watch('isActive') ? 'Active' : 'Inactive'}
                  </strong></p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-4">
              {!isFirstTab && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousTab}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>

            <div className="flex space-x-4">
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
                {isLastTab ? (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? 'Saving Campaign...' : 'Save & Complete'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? 'Saving...' : 'Save & Continue'}
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Form Validation Status - Removed list requirement */}
        </form>
      </div>
    </div>
  );
}