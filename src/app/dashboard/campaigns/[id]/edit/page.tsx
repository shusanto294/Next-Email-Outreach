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
import { getAvailableVariables } from '@/lib/utils';
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
}).superRefine((data, ctx) => {
  // Validate subject: either manual subject or AI prompt is required
  if (data.useAiForSubject) {
    if (!data.aiSubjectPrompt || data.aiSubjectPrompt.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AI subject prompt is required when using AI for subject',
        path: ['aiSubjectPrompt'],
      });
    }
  } else {
    if (!data.subject || data.subject.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Subject is required',
        path: ['subject'],
      });
    }
  }

  // Validate content: either manual content or AI prompt is required
  if (data.useAiForContent) {
    if (!data.aiContentPrompt || data.aiContentPrompt.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AI content prompt is required when using AI for content',
        path: ['aiContentPrompt'],
      });
    }
  } else {
    if (!data.content || data.content.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Content is required',
        path: ['content'],
      });
    }
  }
});

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  sequences: z.array(sequenceSchema).min(1, 'At least one email sequence is required'),
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
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<{[key: string]: string}>({});
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [csvContacts, setCsvContacts] = useState<Contact[]>([]);
  const [contactsProcessingSummary, setContactsProcessingSummary] = useState<{
    newContacts: number;
    duplicateContacts: number;
    totalProcessed: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [availableVariables, setAvailableVariables] = useState<{
    standard: string[];
    personalization: string[];
    customFields: string[];
  }>({ standard: [], personalization: [], customFields: [] });
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
      // Fetch both campaign and email accounts
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

  const parseCsvFile = async (file: File) => {
    const text = await file.text();
    
    // Better CSV parsing that handles quoted fields with commas
    const parseCSVLine = (line: string): string[] => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            // Handle escaped quotes
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quotes
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // End of field
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add the last field
      result.push(current.trim());
      
      return result;
    };
    
    const lines = text.split('\n').filter(line => line.trim());
    console.log(`📊 CSV contains ${lines.length} lines total`);
    
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }
    
    const headers = parseCSVLine(lines[0]);
    console.log('📋 CSV headers:', headers);
    
    const data = lines.slice(1).map(line => parseCSVLine(line));
    console.log(`📊 Parsed ${data.length} data rows`);
    
    return { headers, data };
  };

  const autoDetectColumnMapping = (headers: string[]): {[key: string]: string} => {
    const mapping: {[key: string]: string} = {};
    
    console.log('🔍 Auto-detecting column mapping for headers:', headers);
    
    // Exact matches for specific column names (case-insensitive)
    const exactMatches = {
      'Email': 'email',
      'First Name': 'firstName', 
      'Last Name': 'lastName',
      'Company': 'company',
      'Title': 'position',
      'Website': 'website',
      'Person Linkedin Url': 'linkedin',
      'Company Linkedin Url': 'companyLinkedin',
      'Mobile Phone': 'phone',
      'Work Direct Phone': 'phone',
      'Corporate Phone': 'phone',
      'Home Phone': 'phone',
      'Other Phone': 'phone',
    };
    
    // First pass: exact matches
    headers.forEach(header => {
      const exactMatch = exactMatches[header];
      if (exactMatch && !mapping[exactMatch]) {
        mapping[exactMatch] = header;
        console.log(`✅ Exact match: "${header}" to "${exactMatch}"`);
      }
    });
    
    // Second pass: flexible matching for remaining fields
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase();
      
      // Email - must contain 'email'
      if (!mapping.email && lowerHeader.includes('email')) {
        mapping.email = header;
        console.log(`✅ Email match: "${header}"`);
      }
      
      // First Name - look for 'first' and 'name'
      if (!mapping.firstName && lowerHeader.includes('first') && lowerHeader.includes('name')) {
        mapping.firstName = header;
        console.log(`✅ First Name match: "${header}"`);
      }
      
      // Last Name - look for 'last' and 'name'  
      if (!mapping.lastName && lowerHeader.includes('last') && lowerHeader.includes('name')) {
        mapping.lastName = header;
        console.log(`✅ Last Name match: "${header}"`);
      }
      
      // Company - prefer exact 'Company' but allow variations
      if (!mapping.company) {
        if (lowerHeader === 'company' || 
            lowerHeader === 'company name' ||
            lowerHeader === 'account' ||
            lowerHeader === 'organization') {
          mapping.company = header;
          console.log(`✅ Company match: "${header}"`);
        }
      }
      
      // Position/Title - look for title, position, role
      if (!mapping.position && (lowerHeader === 'title' || 
                                lowerHeader.includes('job title') || 
                                lowerHeader.includes('position') || 
                                lowerHeader.includes('role'))) {
        mapping.position = header;
        console.log(`✅ Position match: "${header}"`);
      }
      
      // Website - look for website, url, site
      if (!mapping.website && (lowerHeader === 'website' || 
                               lowerHeader.includes('web') || 
                               lowerHeader.includes('url') || 
                               lowerHeader.includes('site'))) {
        mapping.website = header;
        console.log(`✅ Website match: "${header}"`);
      }
      
      // Person LinkedIn - specific pattern
      if (!mapping.linkedin && lowerHeader.includes('person') && lowerHeader.includes('linkedin')) {
        mapping.linkedin = header;
        console.log(`✅ Person LinkedIn match: "${header}"`);
      }
      
      // Company LinkedIn - specific pattern  
      if (!mapping.companyLinkedin && lowerHeader.includes('company') && lowerHeader.includes('linkedin')) {
        mapping.companyLinkedin = header;
        console.log(`✅ Company LinkedIn match: "${header}"`);
      }
      
      // Phone - look for any phone field (prioritize mobile, then work, then others)
      if (!mapping.phone) {
        if (lowerHeader.includes('mobile') && lowerHeader.includes('phone')) {
          mapping.phone = header;
          console.log(`✅ Phone match (mobile): "${header}"`);
        } else if (lowerHeader.includes('work') && lowerHeader.includes('phone')) {
          mapping.phone = header;
          console.log(`✅ Phone match (work): "${header}"`);
        } else if (lowerHeader.includes('corporate') && lowerHeader.includes('phone')) {
          mapping.phone = header;
          console.log(`✅ Phone match (corporate): "${header}"`);
        } else if (lowerHeader.includes('phone')) {
          mapping.phone = header;
          console.log(`✅ Phone match (general): "${header}"`);
        }
      }
    });

    console.log('📋 Final column mapping:', mapping);
    return mapping;
  };

  const handleCsvFileUpload = async (file: File) => {
    try {
      const { headers, data } = await parseCsvFile(file);
      const autoMapping = autoDetectColumnMapping(headers);
      
      setCsvHeaders(headers);
      setCsvData(data);
      setCsvFile(file);
      setColumnMapping(autoMapping);
      setShowColumnMapping(true);
      setContactsProcessingSummary(null); // Clear previous processing summary
      setCsvContacts([]); // Clear previous contacts
      setError('');
    } catch (err: any) {
      setError(err.message || 'Error reading CSV file');
    }
  };

  const processCsvWithMapping = async () => {
    if (!csvData.length || !columnMapping.email) {
      setError('Please map at least the email column');
      return;
    }

    setIsProcessingCsv(true);
    setError('');
    
    try {
      console.log(`🔄 Processing ${csvData.length} rows from CSV...`);
      
      const token = localStorage.getItem('token');
      const contactsToCreate = [];
      const emailIndex = csvHeaders.indexOf(columnMapping.email);
      
      if (emailIndex === -1) {
        throw new Error('Email column not found in CSV');
      }
      
      // Process all rows
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        // Skip empty rows
        if (!row || row.every(cell => !cell.trim())) {
          console.log(`⚠️ Skipping empty row ${i + 1}`);
          continue;
        }
        
        const email = row[emailIndex]?.trim();
        
        if (email && email.includes('@') && email.includes('.')) {
          const contactData: any = { email: email.toLowerCase() };
          
          // Map all other fields based on column mapping
          Object.entries(columnMapping).forEach(([field, csvColumn]) => {
            if (field !== 'email' && csvColumn) {
              const columnIndex = csvHeaders.indexOf(csvColumn);
              if (columnIndex !== -1 && columnIndex < row.length) {
                const value = row[columnIndex]?.trim();
                if (value) {
                  contactData[field] = value;
                }
              }
            }
          });
          
          contactsToCreate.push(contactData);
        } else {
          console.log(`⚠️ Skipping row ${i + 1} - invalid email: "${email}"`);
        }
      }
      
      console.log(`✅ Processed ${contactsToCreate.length} valid contacts from ${csvData.length} rows`);
      
      if (contactsToCreate.length === 0) {
        throw new Error('No valid email addresses found in CSV');
      }
      
      // Prepare contacts for direct storage in campaign
      const newContacts = contactsToCreate.map(contactData => ({
        email: contactData.email,
        firstName: contactData.firstName || '',
        lastName: contactData.lastName || '',
        company: contactData.company || '',
        position: contactData.position || '',
        phone: contactData.phone || '',
        website: contactData.website || '',
        linkedin: contactData.linkedin || '',
        companyLinkedin: contactData.companyLinkedin || '',
        tags: [],
        customFields: {},
        personalizationData: {},
        status: 'active' as const,
        timesContacted: 0,
      }));
      
      console.log(`📊 Prepared ${newContacts.length} contacts for storage`);
      if (newContacts.length > 0) {
        console.log('Sample prepared contact:', newContacts[0]);
      }
      
      setCsvContacts(newContacts);
      setShowColumnMapping(false);
      
      // Auto-update the campaign with new contacts stored directly in contacts array
      if (newContacts.length > 0 && campaign) {
        console.log('📧 Processing contacts for campaign update...');
        console.log('New contacts to add:', newContacts.length);
        console.log('Sample new contact:', newContacts[0]);
        
        const existingContacts = campaign.contacts || [];
        console.log('Existing contacts:', existingContacts.length);
        
        const existingEmails = new Set(existingContacts.map(c => c.email));
        
        // Filter out duplicates based on email
        const uniqueNewContacts = newContacts.filter(contact => !existingEmails.has(contact.email));
        const duplicateCount = newContacts.length - uniqueNewContacts.length;
        
        console.log('Unique new contacts after filtering:', uniqueNewContacts.length);
        console.log('Duplicate contacts skipped:', duplicateCount);
        
        const allContacts = [...existingContacts, ...uniqueNewContacts];
        console.log('Total contacts for update:', allContacts.length);
        
        // Create a clean payload with only the fields we want to update
        const updatePayload = {
          name: campaign.name,
          description: campaign.description,
          emailAccountIds: campaign.emailAccountIds.map(acc => typeof acc === 'string' ? acc : acc._id),
          sequences: campaign.sequences,
          isActive: campaign.isActive,
          schedule: campaign.schedule,
          trackOpens: campaign.trackOpens,
          trackClicks: campaign.trackClicks,
          unsubscribeLink: campaign.unsubscribeLink,
          contacts: allContacts,
        };
        console.log('Update payload contacts length:', updatePayload.contacts.length);
        console.log('Clean update payload keys:', Object.keys(updatePayload));
        
        try {
          console.log('🚀 Sending campaign update request...');
          console.log('Request URL:', `/api/campaigns/${campaignId}`);
          console.log('Request payload keys:', Object.keys(updatePayload));
          console.log('Contacts in payload:', updatePayload.contacts?.length || 0);
          
          const response = await fetch(`/api/campaigns/${campaignId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(updatePayload),
          });
          
          console.log('📡 Campaign update response status:', response.status);
          const responseText = await response.text();
          console.log('📡 Raw response:', responseText);
          
          if (response.ok) {
            const updatedCampaign = JSON.parse(responseText);
            console.log('✅ Campaign updated successfully');
            console.log('Updated campaign contacts:', updatedCampaign.campaign?.contacts?.length || 0);
            
            if (updatedCampaign.campaign?.contacts?.length > 0) {
              console.log('Sample contact from updated campaign:', updatedCampaign.campaign.contacts[0]);
            }
            
            // Set the processing summary for display
            setContactsProcessingSummary({
              newContacts: uniqueNewContacts.length,
              duplicateContacts: duplicateCount,
              totalProcessed: newContacts.length
            });
            
            setCampaign(updatedCampaign.campaign);
          } else {
            let errorData;
            try {
              errorData = JSON.parse(responseText);
            } catch {
              errorData = { error: responseText };
            }
            console.error('❌ Campaign update failed:', errorData);
            setError(`Failed to update campaign: ${errorData.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('❌ Campaign update error:', err);
          setError('Failed to update campaign with new contacts');
        }
      }
      
    } catch (err: any) {
      setError(err.message || 'Error processing CSV file');
    } finally {
      setIsProcessingCsv(false);
    }
  };

  const onSubmit = async (data: CampaignForm) => {
    console.log('=== UPDATING CAMPAIGN ===');
    console.log('Form data:', data);
    console.log('Selected email accounts:', selectedEmailAccounts);

    if (selectedEmailAccounts.length === 0) {
      setError('Please select at least one email account');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('token');

    try {
      // Process sequences to handle AI/manual field logic
      const processedSequences = data.sequences.map(sequence => {
        const processedSequence = { ...sequence };
        
        // If using AI for subject, ensure subject has a default value
        if (sequence.useAiForSubject) {
          processedSequence.subject = processedSequence.subject || '[AI Generated]';
        }
        
        // If using AI for content, ensure content has a default value
        if (sequence.useAiForContent) {
          processedSequence.content = processedSequence.content || '[AI Generated]';
        }
        
        return processedSequence;
      });

      // Update the existing campaign with all selected email accounts
      console.log('📝 Updating existing campaign with multiple email accounts...');
      const updatePayload = {
        ...data,
        sequences: processedSequences,
        emailAccountIds: selectedEmailAccounts,
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
    } catch (err: any) {
      console.error('❌ Campaign update error:', err);
      setError(err.message || 'An error occurred while updating the campaign');
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
                  Email Accounts * (Select multiple to create additional campaigns)
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
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Subject Line *
                      </label>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-medium text-gray-600">
                          Manual
                        </span>
                        <ToggleSwitch
                          checked={watch(`sequences.${index}.useAiForSubject`) || false}
                          onCheckedChange={(checked) => setValue(`sequences.${index}.useAiForSubject`, checked)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-blue-600">
                          AI
                        </span>
                      </div>
                    </div>
                    {!watch(`sequences.${index}.useAiForSubject`) ? (
                      <Input
                        {...register(`sequences.${index}.subject`)}
                        placeholder="Quick question about {{company}}"
                        className="w-full"
                      />
                    ) : (
                      <textarea
                        {...register(`sequences.${index}.aiSubjectPrompt`)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Enter your AI prompt for generating subject line personalization (e.g., 'Create a personalized subject line about the company's recent achievements')"
                      />
                    )}
                    {errors.sequences?.[index]?.subject && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.subject?.message}
                      </p>
                    )}
                    {errors.sequences?.[index]?.aiSubjectPrompt && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.aiSubjectPrompt?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Email Content *
                      </label>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-medium text-gray-600">
                          Manual
                        </span>
                        <ToggleSwitch
                          checked={watch(`sequences.${index}.useAiForContent`) || false}
                          onCheckedChange={(checked) => setValue(`sequences.${index}.useAiForContent`, checked)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-blue-600">
                          AI
                        </span>
                      </div>
                    </div>
                    {!watch(`sequences.${index}.useAiForContent`) ? (
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
                    ) : (
                      <textarea
                        {...register(`sequences.${index}.aiContentPrompt`)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={6}
                        placeholder="Enter your AI prompt for generating personalized email content (e.g., 'Write a professional outreach email mentioning the recipient's company achievements and offering our services')"
                      />
                    )}
                    {errors.sequences?.[index]?.content && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.content?.message}
                      </p>
                    )}
                    {errors.sequences?.[index]?.aiContentPrompt && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.sequences[index]?.aiContentPrompt?.message}
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
                    <p><strong>Manual Mode:</strong> Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{company}}'}, {'{{position}}'}, {'{{phone}}'}, {'{{website}}'}, {'{{linkedin}}'}, {'{{fromName}}'}</p>
                    <p><strong>AI Mode:</strong> Enter detailed prompts describing how to personalize the content. The AI will generate personalized subject lines and email content for each recipient based on their information.</p>
                    <p>Personalization variables: Any custom field from contact's personalizationData (e.g., {'{{industry}}'}, {'{{jobTitle}}'}, {'{{customField}}'})</p>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addSequence}>
                <Plus className="w-4 h-4 mr-2" />
                Add Follow-up Email
              </Button>
            </CardContent>
          </Card>

          {/* Contact Upload */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upload Recipients</CardTitle>
                  <CardDescription>
                    Upload your contact list via CSV file with column mapping
                  </CardDescription>
                </div>
                {campaign && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {campaign.contacts?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">Current Contacts</div>
                    {campaign.contacts?.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/campaigns/${campaignId}/contacts`)}
                        className="mt-2"
                      >
                        View Contacts
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* CSV Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <div className="text-center">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleCsvFileUpload(file);
                        }
                      }}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label
                      htmlFor="csv-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <div className="text-gray-400 mb-2">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-gray-700">
                        {csvFile ? csvFile.name : 'Upload CSV File'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Upload a CSV file with your contacts
                      </p>
                    </label>
                  </div>
                </div>

                {/* Column Mapping Interface */}
                {showColumnMapping && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-3">Column Mapping</h4>
                    <p className="text-sm text-blue-700 mb-4">
                      Please map your CSV columns to the corresponding contact fields below.
                    </p>
                    
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {[
                        { field: 'email', label: 'Email *', required: true },
                        { field: 'firstName', label: 'First Name', required: false },
                        { field: 'lastName', label: 'Last Name', required: false },
                        { field: 'company', label: 'Company', required: false },
                        { field: 'position', label: 'Position', required: false },
                        { field: 'phone', label: 'Phone', required: false },
                        { field: 'website', label: 'Website', required: false },
                        { field: 'linkedin', label: 'Person LinkedIn URL', required: false },
                        { field: 'companyLinkedin', label: 'Company LinkedIn URL', required: false },
                      ].map(({ field, label, required }) => {
                        return (
                          <div key={field}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {label}
                            </label>
                            <select
                              value={columnMapping[field] || ''}
                              onChange={(e) => setColumnMapping(prev => ({
                                ...prev,
                                [field]: e.target.value
                              }))}
                              className={`w-full rounded-md border ${
                                required && !columnMapping[field] 
                                  ? 'border-red-300' 
                                  : 'border-gray-300'
                              } px-3 py-2 text-sm`}
                            >
                              <option value="">-- Select Column --</option>
                              {csvHeaders.map((header, index) => (
                                <option key={index} value={header}>{header}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>

                    {csvData.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-700 mb-2">Preview (first 3 rows):</h5>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="min-w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-b">
                                {csvHeaders.map((header, index) => (
                                  <th key={index} className="px-3 py-2 text-left font-medium text-gray-700 border-r last:border-r-0 max-w-32">
                                    <div className="truncate" title={header}>
                                      {header}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvData.slice(0, 3).map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b last:border-b-0 hover:bg-gray-25">
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-3 py-2 text-gray-600 border-r last:border-r-0 max-w-32">
                                      <div className="truncate text-xs leading-tight" title={cell || ''}>
                                        {cell || '-'}
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Showing first 3 rows. Hover over cells to see full content.
                        </p>
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        onClick={processCsvWithMapping}
                        disabled={!columnMapping.email || isProcessingCsv}
                      >
                        {isProcessingCsv ? 'Processing...' : 'Process Contacts'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowColumnMapping(false);
                          setCsvFile(null);
                          setCsvHeaders([]);
                          setCsvData([]);
                          setColumnMapping({});
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Success Message */}
                {contactsProcessingSummary && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-medium text-green-800 mb-3">
                      Contact Processing Complete
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-700">
                          {contactsProcessingSummary.newContacts}
                        </div>
                        <div className="text-sm text-green-600">New Contacts Added</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-700">
                          {contactsProcessingSummary.duplicateContacts}
                        </div>
                        <div className="text-sm text-yellow-600">Duplicates Skipped</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-700">
                          {contactsProcessingSummary.totalProcessed}
                        </div>
                        <div className="text-sm text-blue-600">Total Processed</div>
                      </div>
                    </div>
                    
                    {contactsProcessingSummary.newContacts > 0 && csvContacts.length > 0 && (
                      <div>
                        <h5 className="font-medium text-green-700 mb-2">Sample New Contacts:</h5>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {csvContacts.slice(0, 3).map((contact, index) => (
                            <div key={index} className="text-sm text-green-700">
                              {contact.firstName && contact.lastName 
                                ? `${contact.firstName} ${contact.lastName} (${contact.email})`
                                : contact.email}
                            </div>
                          ))}
                          {csvContacts.length > 3 && (
                            <div className="text-sm text-green-600 italic">
                              ...and {csvContacts.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {contactsProcessingSummary.duplicateContacts > 0 && (
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <strong>Note:</strong> {contactsProcessingSummary.duplicateContacts} contacts were skipped because they already exist in this campaign (based on email address).
                      </div>
                    )}
                  </div>
                )}
              </div>
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
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Updating Campaign...' : 'Update Campaign'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}