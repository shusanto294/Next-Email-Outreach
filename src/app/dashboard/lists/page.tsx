'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Eye, Edit, Trash2, Upload } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

interface List {
  _id: string;
  name: string;
  enableAiPersonalization: boolean;
  personalizationPrompt?: string;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    enableAiPersonalization: false,
    personalizationPrompt: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedListForUpload, setSelectedListForUpload] = useState<List | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

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

      await fetchLists();
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.push('/auth/login');
    }
  };

  const fetchLists = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/lists', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lists');
      }

      const data = await response.json();
      setLists(data.lists);
    } catch (error) {
      setMessage('Failed to fetch lists');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const url = editingList ? `/api/lists/${editingList._id}` : '/api/lists';
      const method = editingList ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          enableAiPersonalization: formData.enableAiPersonalization,
          personalizationPrompt: formData.personalizationPrompt
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to save list');
      }

      const data = await response.json();
      setMessage(data.message);
      setShowCreateForm(false);
      setEditingList(null);
      setFormData({ name: '', enableAiPersonalization: false, personalizationPrompt: '' });
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (list: List) => {
    setEditingList(list);
    setFormData({
      name: list.name,
      enableAiPersonalization: list.enableAiPersonalization || false,
      personalizationPrompt: list.personalizationPrompt || ''
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (listId: string) => {
    const list = lists.find(l => l._id === listId);
    const contactCount = list?.contactCount || 0;
    
    let confirmMessage = 'Are you sure you want to delete this list?';
    if (contactCount > 0) {
      confirmMessage += ` This will also permanently delete all ${contactCount} contacts in this list.`;
    }
    confirmMessage += ' This action cannot be undone.';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete list');
      }

      const data = await response.json();
      setMessage(data.message);
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setEditingList(null);
    setFormData({ name: '', enableAiPersonalization: false, personalizationPrompt: '' });
    setMessage('');
  };

  const parseCSVLine = (line: string): string[] => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
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

  const autoMapColumns = (csvColumns: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    
    // First, exact matches for common Apollo/CSV column names
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

    // Apply exact matches first
    csvColumns.forEach(csvCol => {
      if (exactMatches[csvCol]) {
        mapping[exactMatches[csvCol]] = csvCol;
      }
    });

    // Then apply fuzzy matching for any unmapped fields
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
        // Skip if already mapped by exact match
        if (mapping[contactField]) continue;
        
        if (variations.some(variation => normalizedCsvCol.includes(variation))) {
          mapping[contactField] = csvCol;
          break;
        }
      }
    });

    return mapping;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, list: List) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedListForUpload(list);
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvContent = event.target?.result as string;
      setCsvData(csvContent);
      
      // Parse CSV headers
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
    if (!selectedListForUpload || !csvData) return;

    setIsUploading(true);
    setMessage('');

    try {
      const lines = csvData.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }

      const headers = parseCSVLine(lines[0]);
      const contacts = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const values = parseCSVLine(line);
        const contact: any = { listId: selectedListForUpload._id };

        // Map columns based on the column mapping
        Object.entries(columnMapping).forEach(([contactField, csvColumn]) => {
          const columnIndex = headers.findIndex(h => h === csvColumn);
          if (columnIndex !== -1 && columnIndex < values.length && values[columnIndex]) {
            contact[contactField] = values[columnIndex];
          }
        });

        // Ensure email is present and valid
        if (contact.email && contact.email.includes('@')) {
          contacts.push(contact);
        }
      }

      if (contacts.length === 0) {
        throw new Error('No valid contacts found with email addresses');
      }

      console.log(`Parsed ${contacts.length} contacts from ${lines.length - 1} CSV rows`);
      console.log('Sample contact:', contacts[0]);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          listId: selectedListForUpload._id,
          contacts
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import contacts');
      }

      const responseData = await response.json();
      console.log('Import response:', responseData);
      
      if (responseData.errors && responseData.errors.length > 0) {
        setMessage(`Import completed: ${responseData.imported} contacts imported successfully, ${responseData.errors.length} errors. Total processed: ${responseData.total}`);
      } else {
        setMessage(`Successfully imported ${responseData.imported || contacts.length} contacts to ${selectedListForUpload.name}`);
      }
      
      setShowUploadForm(false);
      setCsvFile(null);
      setCsvData('');
      setSelectedListForUpload(null);
      setColumnMapping({});
      setDetectedColumns([]);
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadCancel = () => {
    setShowUploadForm(false);
    setCsvFile(null);
    setCsvData('');
    setSelectedListForUpload(null);
    setColumnMapping({});
    setDetectedColumns([]);
    setMessage('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lists</h1>
            <p className="text-gray-600 mt-2">
              Manage your contact lists and organize your prospects
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New List
          </Button>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('success') || message.includes('created') || message.includes('updated') || message.includes('deleted') || message.includes('imported') || message.includes('Successfully')
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}

        {/* Create/Edit Form */}
        {showCreateForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{editingList ? 'Edit List' : 'Create New List'}</CardTitle>
              <CardDescription>
                {editingList ? 'Update your list details' : 'Create a new list to organize your contacts'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    List Name *
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter list name"
                    required
                  />
                </div>
                
                {/* AI Personalization Toggle */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                      🤖
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-900 cursor-pointer">
                        Personalize with AI
                      </label>
                      <p className="text-xs text-gray-600">
                        Enable AI-powered personalization for this list
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, enableAiPersonalization: !formData.enableAiPersonalization })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                      formData.enableAiPersonalization
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                        : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formData.enableAiPersonalization ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className={`transition-all duration-200 ${formData.enableAiPersonalization ? 'opacity-100' : 'opacity-50'}`}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Personalization Prompt
                    {formData.enableAiPersonalization && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <textarea
                    value={formData.personalizationPrompt}
                    onChange={(e) => setFormData({ ...formData, personalizationPrompt: e.target.value })}
                    placeholder={
                      formData.enableAiPersonalization 
                        ? "Enter a personalization prompt that can be used for contacts in this list (e.g., 'Mention their recent company announcement', 'Reference their industry expertise')"
                        : "Enable AI personalization to use this field"
                    }
                    className={`w-full rounded-md border border-input px-3 py-2 text-sm transition-colors ${
                      formData.enableAiPersonalization 
                        ? 'bg-background text-gray-900' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    rows={4}
                    disabled={!formData.enableAiPersonalization}
                    required={formData.enableAiPersonalization}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.enableAiPersonalization 
                      ? "This prompt will help guide AI personalization for contacts in this list"
                      : "Turn on AI personalization to configure custom prompts"
                    }
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : (editingList ? 'Update List' : 'Create List')}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Upload CSV Form */}
        {showUploadForm && selectedListForUpload && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Import Contacts to {selectedListForUpload.name}</CardTitle>
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

        {/* Lists Grid */}
        <div className="grid grid-cols-1 gap-6">
          {lists.map((list) => (
            <Card key={list._id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span className="truncate">{list.name}</span>
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    {list.contactCount} contacts
                  </span>
                </CardTitle>
                {list.enableAiPersonalization && list.personalizationPrompt && (
                  <CardDescription className="text-sm text-gray-600">
                    <strong>Personalization Prompt:</strong> {list.personalizationPrompt}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-xs text-gray-500">
                    Created: {new Date(list.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/dashboard/contacts?listId=${list._id}`)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(list)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <label htmlFor={`upload-${list._id}`} className="cursor-pointer">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="text-green-600 hover:text-green-800"
                      >
                        <span>
                          <Upload className="w-4 h-4" />
                        </span>
                      </Button>
                    </label>
                    <input
                      id={`upload-${list._id}`}
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, list)}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(list._id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {lists.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-lg font-medium mb-2">No lists yet</h3>
                  <p className="text-sm mb-4">Create your first list to organize your contacts</p>
                  <Button 
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First List
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}