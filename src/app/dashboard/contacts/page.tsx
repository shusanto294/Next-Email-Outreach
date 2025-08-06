'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Trash2, Edit, ChevronLeft, ChevronRight, X } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

interface Contact {
  _id: string;
  listId: { _id: string; name: string };
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  companyLinkedin?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  revenue?: string;
  employees?: string;
  status: string;
  emailStatus: string;
  createdAt: string;
  websiteContent?: string;
  personalization?: string;
  notes?: string;
}

interface List {
  _id: string;
  name: string;
  contactCount: number;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showImportForm, setShowImportForm] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    listId: '',
    email: '',
    firstName: '',
    lastName: '',
    company: '',
    position: '',
    phone: '',
    website: '',
    linkedin: '',
    personalization: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [visibleColumns, setVisibleColumns] = useState({
    email: true,
    name: true,
    company: true,
    position: false,
    phone: false,
    website: false,
    linkedin: false,
    city: false,
    industry: false,
    list: true,
    websiteContent: false,
    personalization: false,
    status: true
  });
  
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const listIdFromUrl = searchParams.get('listId');
    if (listIdFromUrl) {
      setSelectedListId(listIdFromUrl);
    }
    checkAuth();
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading) {
      fetchContacts();
    }
  }, [selectedListId, searchTerm, currentPage]);

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

      await Promise.all([fetchLists(), fetchContacts()]);
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
    }
  };

  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20'
      });

      if (selectedListId) params.append('listId', selectedListId);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/contacts?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }

      const data = await response.json();
      setContacts(data.contacts);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      setMessage('Failed to fetch contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListId) {
      setMessage('Please select a list first');
      return;
    }

    setIsImporting(true);
    setMessage('');

    try {
      // Parse CSV data
      const lines = csvData.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.findIndex(h => h.includes('email'));
      
      if (emailIndex === -1) {
        throw new Error('CSV must contain an email column');
      }

      const contacts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length > emailIndex && values[emailIndex]) {
          const contact: any = {
            email: values[emailIndex]
          };

          // Map other fields
          headers.forEach((header, index) => {
            if (index < values.length && values[index]) {
              if (header.includes('first') && header.includes('name')) {
                contact.firstName = values[index];
              } else if (header.includes('last') && header.includes('name')) {
                contact.lastName = values[index];
              } else if (header.includes('company')) {
                contact.company = values[index];
              } else if (header.includes('position') || header.includes('title')) {
                contact.position = values[index];
              } else if (header.includes('phone')) {
                contact.phone = values[index];
              } else if (header.includes('website')) {
                contact.website = values[index];
              } else if (header.includes('linkedin')) {
                contact.linkedin = values[index];
              }
            }
          });

          contacts.push(contact);
        }
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          listId: selectedListId,
          contacts
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import contacts');
      }

      const data = await response.json();
      setMessage(data.message);
      setShowImportForm(false);
      setCsvData('');
      await fetchContacts();
      await fetchLists(); // Refresh list counts
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add contact');
      }

      const data = await response.json();
      setMessage(data.message);
      setShowAddForm(false);
      setFormData({
        listId: '',
        email: '',
        firstName: '',
        lastName: '',
        company: '',
        position: '',
        phone: '',
        website: '',
        linkedin: '',
        personalization: ''
      });
      await fetchContacts();
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewContact = (contact: Contact) => {
    const index = contacts.findIndex(c => c._id === contact._id);
    setCurrentContactIndex(index);
    setViewingContact(contact);
  };

  const handlePreviousContact = () => {
    if (currentContactIndex > 0) {
      const newIndex = currentContactIndex - 1;
      setCurrentContactIndex(newIndex);
      setViewingContact(contacts[newIndex]);
    }
  };

  const handleNextContact = () => {
    if (currentContactIndex < contacts.length - 1) {
      const newIndex = currentContactIndex + 1;
      setCurrentContactIndex(newIndex);
      setViewingContact(contacts[newIndex]);
    }
  };

  const closeContactView = () => {
    setViewingContact(null);
    setCurrentContactIndex(0);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setEditFormData({
      listId: contact.listId._id,
      email: contact.email,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      company: contact.company || '',
      position: contact.position || '',
      phone: contact.phone || '',
      website: contact.website || '',
      linkedin: contact.linkedin || '',
      city: contact.city || '',
      state: contact.state || '',
      country: contact.country || '',
      industry: contact.industry || '',
      personalization: contact.personalization || '',
      notes: contact.notes || ''
    });
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;

    setIsSubmitting(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contacts/${editingContact._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update contact');
      }

      const data = await response.json();
      setMessage(data.message);
      setEditingContact(null);
      setEditFormData({});
      await fetchContacts();
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  const closeEditForm = () => {
    setEditingContact(null);
    setEditFormData({});
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete contact');
      }

      const data = await response.json();
      setMessage(data.message);
      await fetchContacts();
      await fetchLists();
    } catch (error: any) {
      setMessage(error.message);
    }
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600 mt-2">
            Manage your contacts and prospects
          </p>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('success') || message.includes('imported') || message.includes('added') || message.includes('deleted')
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}

        {/* Filters and Actions */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-64">
            <Input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Lists</option>
            {lists.map((list) => (
              <option key={list._id} value={list._id}>
                {list.name} ({list.contactCount})
              </option>
            ))}
          </select>
          <Button 
            onClick={() => setShowAddForm(true)}
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
          <Button 
            onClick={() => setShowImportForm(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
        </div>

        {/* Column Visibility Controls */}
        <div className="mb-6 bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Show Columns</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.email}
                onChange={() => handleColumnToggle('email')}
                className="rounded border-gray-300"
              />
              <span>Email</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.name}
                onChange={() => handleColumnToggle('name')}
                className="rounded border-gray-300"
              />
              <span>Name</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.company}
                onChange={() => handleColumnToggle('company')}
                className="rounded border-gray-300"
              />
              <span>Company</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.position}
                onChange={() => handleColumnToggle('position')}
                className="rounded border-gray-300"
              />
              <span>Position</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.phone}
                onChange={() => handleColumnToggle('phone')}
                className="rounded border-gray-300"
              />
              <span>Phone</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.website}
                onChange={() => handleColumnToggle('website')}
                className="rounded border-gray-300"
              />
              <span>Website</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.linkedin}
                onChange={() => handleColumnToggle('linkedin')}
                className="rounded border-gray-300"
              />
              <span>LinkedIn</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.city}
                onChange={() => handleColumnToggle('city')}
                className="rounded border-gray-300"
              />
              <span>Location</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.industry}
                onChange={() => handleColumnToggle('industry')}
                className="rounded border-gray-300"
              />
              <span>Industry</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.list}
                onChange={() => handleColumnToggle('list')}
                className="rounded border-gray-300"
              />
              <span>List</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.websiteContent}
                onChange={() => handleColumnToggle('websiteContent')}
                className="rounded border-gray-300"
              />
              <span>Website Content</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.personalization}
                onChange={() => handleColumnToggle('personalization')}
                className="rounded border-gray-300"
              />
              <span>Personalization</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={visibleColumns.status}
                onChange={() => handleColumnToggle('status')}
                className="rounded border-gray-300"
              />
              <span>Status</span>
            </label>
          </div>
        </div>

        {/* Add Contact Form */}
        {showAddForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Add New Contact</CardTitle>
              <CardDescription>Add a single contact to a list</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddContact} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      List *
                    </label>
                    <select
                      value={formData.listId}
                      onChange={(e) => setFormData({ ...formData, listId: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select a list</option>
                      {lists.map((list) => (
                        <option key={list._id} value={list._id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <Input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <Input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company
                    </label>
                    <Input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Position
                    </label>
                    <Input
                      type="text"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Personalization
                  </label>
                  <textarea
                    value={formData.personalization}
                    onChange={(e) => setFormData({ ...formData, personalization: e.target.value })}
                    placeholder="Enter custom personalization text for this contact"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Contact'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Import CSV Form */}
        {showImportForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Import Contacts from CSV</CardTitle>
              <CardDescription>
                Paste your CSV data below. First row should contain headers (email is required).
                {!selectedListId && ' Please select a list first.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleImport} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select List *
                  </label>
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select a list</option>
                    {lists.map((list) => (
                      <option key={list._id} value={list._id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CSV Data *
                  </label>
                  <textarea
                    value={csvData}
                    onChange={(e) => setCsvData(e.target.value)}
                    placeholder="email,first_name,last_name,company,position&#10;john@example.com,John,Doe,Acme Corp,Manager&#10;jane@example.com,Jane,Smith,Tech Inc,Developer"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    rows={8}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported columns: email*, first_name, last_name, company, position, phone, website, linkedin
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" disabled={isImporting || !selectedListId}>
                    {isImporting ? 'Importing...' : 'Import Contacts'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setShowImportForm(false);
                    setCsvData('');
                  }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Contacts 
              {selectedListId && lists.find(l => l._id === selectedListId) && 
                ` in ${lists.find(l => l._id === selectedListId)?.name || 'Unknown List'}`
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-6xl mb-4">👥</div>
                  <h3 className="text-lg font-medium mb-2">No contacts found</h3>
                  <p className="text-sm mb-4">
                    {selectedListId ? 'This list is empty' : 'You haven\'t added any contacts yet'}
                  </p>
                  <div className="space-x-2">
                    <Button onClick={() => setShowAddForm(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Contact
                    </Button>
                    <Button variant="outline" onClick={() => setShowImportForm(true)}>
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {contacts.map((contact) => (
                  <div key={contact._id} className="bg-white border rounded-lg overflow-hidden">
                    {/* Main contact info table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm table-fixed">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            {visibleColumns.email && <th className="p-3 text-left font-medium text-gray-700 w-48">Email</th>}
                            {visibleColumns.name && <th className="p-3 text-left font-medium text-gray-700 w-40">Name</th>}
                            {visibleColumns.company && <th className="p-3 text-left font-medium text-gray-700 w-40">Company</th>}
                            {visibleColumns.position && <th className="p-3 text-left font-medium text-gray-700 w-36">Position</th>}
                            {visibleColumns.phone && <th className="p-3 text-left font-medium text-gray-700 w-32">Phone</th>}
                            {visibleColumns.website && <th className="p-3 text-left font-medium text-gray-700 w-36">Website</th>}
                            {visibleColumns.linkedin && <th className="p-3 text-left font-medium text-gray-700 w-24">LinkedIn</th>}
                            {visibleColumns.city && <th className="p-3 text-left font-medium text-gray-700 w-40">Location</th>}
                            {visibleColumns.industry && <th className="p-3 text-left font-medium text-gray-700 w-32">Industry</th>}
                            {visibleColumns.list && <th className="p-3 text-left font-medium text-gray-700 w-36">List</th>}
                            {visibleColumns.status && <th className="p-3 text-left font-medium text-gray-700 w-24">Status</th>}
                            <th className="p-3 text-right font-medium text-gray-700 w-28">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="hover:bg-gray-50">
                            {visibleColumns.email && <td className="p-3 font-medium w-48 truncate">{contact.email}</td>}
                            {visibleColumns.name && (
                              <td className="p-3 w-40 truncate">
                                {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}
                              </td>
                            )}
                            {visibleColumns.company && <td className="p-3 w-40 truncate">{contact.company || '-'}</td>}
                            {visibleColumns.position && <td className="p-3 w-36 truncate">{contact.position || '-'}</td>}
                            {visibleColumns.phone && <td className="p-3 w-32 truncate">{contact.phone || '-'}</td>}
                            {visibleColumns.website && (
                              <td className="p-3 w-36 truncate">
                                {contact.website ? (
                                  <a 
                                    href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-xs block"
                                  >
                                    {contact.website}
                                  </a>
                                ) : '-'}
                              </td>
                            )}
                            {visibleColumns.linkedin && (
                              <td className="p-3 w-24 truncate">
                                {contact.linkedin ? (
                                  <a 
                                    href={contact.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-xs block"
                                  >
                                    LinkedIn
                                  </a>
                                ) : '-'}
                              </td>
                            )}
                            {visibleColumns.city && (
                              <td className="p-3 w-40 truncate">
                                {[contact.city, contact.state, contact.country].filter(Boolean).join(', ') || '-'}
                              </td>
                            )}
                            {visibleColumns.industry && <td className="p-3 w-32 truncate">{contact.industry || '-'}</td>}
                            {visibleColumns.list && <td className="p-3 w-36 truncate">{contact.listId?.name || 'No List'}</td>}
                            {visibleColumns.status && (
                              <td className="p-3 w-24">
                                <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                                  contact.status === 'active' ? 'bg-green-100 text-green-800' :
                                  contact.status === 'unsubscribed' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {contact.status}
                                </span>
                              </td>
                            )}
                            <td className="p-3 w-28">
                              <div className="flex justify-end space-x-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditContact(contact)}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteContact(contact._id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Full-width sections for website content and personalization */}
                    {(visibleColumns.websiteContent || visibleColumns.personalization) && (
                      <div className="border-t bg-gray-50">
                        {visibleColumns.personalization && contact.personalization && (
                          <div className="p-4 border-b border-gray-200 last:border-b-0">
                            <div className="flex items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-900">AI Personalization</h4>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-md">
                              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {contact.personalization}
                              </div>
                            </div>
                          </div>
                        )}
                        {visibleColumns.personalization && !contact.personalization && (
                          <div className="p-4 border-b border-gray-200 last:border-b-0">
                            <div className="flex items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-900">AI Personalization</h4>
                            </div>
                            <div className="bg-gray-100 p-3 rounded-md">
                              <span className="text-gray-500 text-sm italic">No personalization available</span>
                            </div>
                          </div>
                        )}
                        {visibleColumns.websiteContent && contact.websiteContent && (
                          <div className="p-4 border-b border-gray-200 last:border-b-0">
                            <div className="flex items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-900">Website Content</h4>
                            </div>
                            <div className="bg-white p-3 rounded-md border">
                              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                                {contact.websiteContent}
                              </div>
                            </div>
                          </div>
                        )}
                        {visibleColumns.websiteContent && !contact.websiteContent && (
                          <div className="p-4 border-b border-gray-200 last:border-b-0">
                            <div className="flex items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-900">Website Content</h4>
                            </div>
                            <div className="bg-gray-100 p-3 rounded-md">
                              <span className="text-gray-500 text-sm italic">No website content available</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Contact Modal */}
        {editingContact && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Edit Contact</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeEditForm}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="p-6">
                <form onSubmit={handleUpdateContact} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        List *
                      </label>
                      <select
                        value={editFormData.listId}
                        onChange={(e) => setEditFormData({ ...editFormData, listId: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="">Select a list</option>
                        {lists.map((list) => (
                          <option key={list._id} value={list._id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email *
                      </label>
                      <Input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name
                      </label>
                      <Input
                        type="text"
                        value={editFormData.firstName}
                        onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name
                      </label>
                      <Input
                        type="text"
                        value={editFormData.lastName}
                        onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <Input
                        type="text"
                        value={editFormData.company}
                        onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Position
                      </label>
                      <Input
                        type="text"
                        value={editFormData.position}
                        onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <Input
                        type="text"
                        value={editFormData.phone}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Website
                      </label>
                      <Input
                        type="text"
                        value={editFormData.website}
                        onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        LinkedIn
                      </label>
                      <Input
                        type="text"
                        value={editFormData.linkedin}
                        onChange={(e) => setEditFormData({ ...editFormData, linkedin: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <Input
                        type="text"
                        value={editFormData.city}
                        onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <Input
                        type="text"
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                      </label>
                      <Input
                        type="text"
                        value={editFormData.country}
                        onChange={(e) => setEditFormData({ ...editFormData, country: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Industry
                      </label>
                      <Input
                        type="text"
                        value={editFormData.industry}
                        onChange={(e) => setEditFormData({ ...editFormData, industry: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Personalization
                    </label>
                    <textarea
                      value={editFormData.personalization}
                      onChange={(e) => setEditFormData({ ...editFormData, personalization: e.target.value })}
                      placeholder="Enter custom personalization text for this contact"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={editFormData.notes}
                      onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                      placeholder="Additional notes about this contact"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={closeEditForm}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Updating...' : 'Update Contact'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}