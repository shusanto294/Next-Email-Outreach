'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Search, Edit2, Trash2, Mail, Phone, Globe, Linkedin, Building2, User, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardHeader from '@/components/DashboardHeader';

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
  contacts: Contact[];
  isActive: boolean;
}

export default function CampaignContactsPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [paginatedContacts, setPaginatedContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const ITEMS_PER_PAGE = 20;
  
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  useEffect(() => {
    filterContacts();
  }, [contacts, searchTerm, statusFilter]);

  useEffect(() => {
    paginateContacts();
  }, [filteredContacts, currentPage]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const fetchCampaign = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch campaign');
      }

      const data = await response.json();
      setCampaign(data.campaign);
      setContacts(data.campaign.contacts || []);
    } catch (error) {
      console.error('Error fetching campaign:', error);
      setError('Failed to load campaign contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const filterContacts = () => {
    let filtered = [...contacts];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(contact => 
        contact.email.toLowerCase().includes(term) ||
        (contact.firstName?.toLowerCase() || '').includes(term) ||
        (contact.lastName?.toLowerCase() || '').includes(term) ||
        (contact.company?.toLowerCase() || '').includes(term) ||
        (contact.position?.toLowerCase() || '').includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contact => contact.status === statusFilter);
    }

    setFilteredContacts(filtered);
  };

  const paginateContacts = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    setPaginatedContacts(filteredContacts.slice(startIndex, endIndex));
  };

  const getTotalPages = () => {
    return Math.ceil(filteredContacts.length / ITEMS_PER_PAGE);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateContactStatus = async (contactIndex: number, newStatus: Contact['status']) => {
    if (!campaign) return;

    setIsUpdating(true);
    const token = localStorage.getItem('token');

    try {
      const updatedContacts = [...contacts];
      updatedContacts[contactIndex] = { ...updatedContacts[contactIndex], status: newStatus };

      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...campaign,
          contacts: updatedContacts,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update contact');
      }

      const result = await response.json();
      setCampaign(result.campaign);
      setContacts(result.campaign.contacts || []);
    } catch (error) {
      console.error('Error updating contact:', error);
      setError('Failed to update contact status');
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteContact = async (contactIndex: number) => {
    if (!campaign) return;
    
    if (!confirm('Are you sure you want to remove this contact from the campaign?')) {
      return;
    }

    setIsUpdating(true);
    const token = localStorage.getItem('token');

    try {
      const updatedContacts = contacts.filter((_, index) => index !== contactIndex);

      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...campaign,
          contacts: updatedContacts,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete contact');
      }

      const result = await response.json();
      setCampaign(result.campaign);
      setContacts(result.campaign.contacts || []);
    } catch (error) {
      console.error('Error deleting contact:', error);
      setError('Failed to delete contact');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status: Contact['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'unsubscribed': return 'bg-red-100 text-red-800';
      case 'bounced': return 'bg-yellow-100 text-yellow-800';
      case 'complained': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusCounts = () => {
    const counts = {
      all: contacts.length,
      active: contacts.filter(c => c.status === 'active').length,
      unsubscribed: contacts.filter(c => c.status === 'unsubscribed').length,
      bounced: contacts.filter(c => c.status === 'bounced').length,
      complained: contacts.filter(c => c.status === 'complained').length,
    };
    return counts;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading contacts...</div>
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

  const statusCounts = getStatusCounts();

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center mb-6">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/campaigns/${campaignId}/edit`)}
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaign
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Campaign Contacts</h1>
            <p className="text-gray-600 mt-2">
              {campaign.name} - {contacts.length} total contacts
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setStatusFilter('all')}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{statusCounts.all}</div>
              <div className="text-sm text-gray-600">All Contacts</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setStatusFilter('active')}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{statusCounts.active}</div>
              <div className="text-sm text-gray-600">Active</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setStatusFilter('unsubscribed')}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{statusCounts.unsubscribed}</div>
              <div className="text-sm text-gray-600">Unsubscribed</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setStatusFilter('bounced')}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{statusCounts.bounced}</div>
              <div className="text-sm text-gray-600">Bounced</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setStatusFilter('complained')}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{statusCounts.complained}</div>
              <div className="text-sm text-gray-600">Complained</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search contacts by name, email, company, or position..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Contacts List */}
        {filteredContacts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || statusFilter !== 'all' ? 'No contacts match your search' : 'No contacts yet'}
              </h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search terms or filters'
                  : 'Upload contacts via the campaign edit page to get started'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {paginatedContacts.map((contact, index) => {
              const originalIndex = contacts.findIndex(c => c.email === contact.email);
              return (
                <Card key={contact.email} className="hover:bg-gray-50">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {contact.firstName && contact.lastName
                                ? `${contact.firstName} ${contact.lastName}`
                                : contact.firstName || contact.lastName || 'No Name'}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(contact.status)}`}>
                              {contact.status}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Mail className="w-4 h-4" />
                              <span>{contact.email}</span>
                            </div>
                            {contact.phone && (
                              <div className="flex items-center space-x-2">
                                <Phone className="w-4 h-4" />
                                <span>{contact.phone}</span>
                              </div>
                            )}
                            {contact.website && (
                              <div className="flex items-center space-x-2">
                                <Globe className="w-4 h-4" />
                                <a href={contact.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  {contact.website}
                                </a>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {contact.company && (
                              <div className="flex items-center space-x-2">
                                <Building2 className="w-4 h-4" />
                                <span>{contact.company}</span>
                              </div>
                            )}
                            {contact.position && (
                              <div className="flex items-center space-x-2">
                                <User className="w-4 h-4" />
                                <span>{contact.position}</span>
                              </div>
                            )}
                            {contact.linkedin && (
                              <div className="flex items-center space-x-2">
                                <Linkedin className="w-4 h-4" />
                                <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  LinkedIn Profile
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {contact.timesContacted > 0 && (
                          <div className="mt-3 text-sm text-gray-500">
                            Contacted {contact.timesContacted} time{contact.timesContacted !== 1 ? 's' : ''}
                            {contact.lastContacted && (
                              <span> • Last: {new Date(contact.lastContacted).toLocaleDateString()}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        {/* Status Change Buttons */}
                        {contact.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateContactStatus(originalIndex, 'active')}
                            disabled={isUpdating}
                            className="text-green-600 hover:text-green-800"
                          >
                            Activate
                          </Button>
                        )}
                        {contact.status !== 'unsubscribed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateContactStatus(originalIndex, 'unsubscribed')}
                            disabled={isUpdating}
                            className="text-red-600 hover:text-red-800"
                          >
                            Unsubscribe
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteContact(originalIndex)}
                          disabled={isUpdating}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filteredContacts.length > ITEMS_PER_PAGE && (
          <Card className="mt-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredContacts.length)} of {filteredContacts.length} contacts
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: getTotalPages() }, (_, i) => i + 1)
                      .filter(page => {
                        // Show first page, last page, current page, and pages around current
                        return page === 1 || 
                               page === getTotalPages() || 
                               (page >= currentPage - 2 && page <= currentPage + 2);
                      })
                      .map((page, index, array) => {
                        // Add ellipsis if there's a gap
                        const showEllipsis = index > 0 && page - array[index - 1] > 1;
                        return (
                          <div key={page} className="flex items-center">
                            {showEllipsis && (
                              <span className="px-2 text-gray-400">...</span>
                            )}
                            <Button
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => handlePageChange(page)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === getTotalPages()}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {filteredContacts.length > 0 && filteredContacts.length <= ITEMS_PER_PAGE && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Showing all {filteredContacts.length} of {contacts.length} contacts
          </div>
        )}
      </div>
    </div>
  );
}