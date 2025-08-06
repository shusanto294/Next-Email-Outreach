import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function generateTrackingPixel(emailLogId: string): string {
  return `${process.env.NEXTAUTH_URL}/api/track/open/${emailLogId}`
}

export function generateUnsubscribeUrl(contactId: string): string {
  return `${process.env.NEXTAUTH_URL}/unsubscribe/${contactId}`
}

export function calculateOpenRate(opened: number, sent: number): number {
  if (sent === 0) return 0
  return Math.round((opened / sent) * 100)
}

export function calculateClickRate(clicked: number, sent: number): number {
  if (sent === 0) return 0
  return Math.round((clicked / sent) * 100)
}

export function calculateReplyRate(replied: number, sent: number): number {
  if (sent === 0) return 0
  return Math.round((replied / sent) * 100)
}

export interface ContactVariables {
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  fromName?: string;
  personalizationData?: { [key: string]: string };
  customFields?: { [key: string]: string };
}

export function replaceVariables(template: string, variables: ContactVariables): string {
  let result = template;
  
  // Replace standard contact variables
  const standardVariables = {
    firstName: variables.firstName || '',
    lastName: variables.lastName || '',
    company: variables.company || '',
    position: variables.position || '',
    phone: variables.phone || '',
    website: variables.website || '',
    linkedin: variables.linkedin || '',
    fromName: variables.fromName || ''
  };
  
  // Replace standard variables
  Object.entries(standardVariables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  });
  
  // Replace personalization data variables
  if (variables.personalizationData) {
    Object.entries(variables.personalizationData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    });
  }
  
  // Replace custom fields variables
  if (variables.customFields) {
    Object.entries(variables.customFields).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    });
  }
  
  return result;
}

export function getAvailableVariables(contacts?: Array<{
  personalizationData?: { [key: string]: string };
  customFields?: { [key: string]: string };
}>): {
  standard: string[];
  personalization: string[];
  customFields: string[];
} {
  const standard = ['firstName', 'lastName', 'company', 'position', 'phone', 'website', 'linkedin', 'fromName'];
  
  if (!contacts || contacts.length === 0) {
    return {
      standard,
      personalization: [],
      customFields: []
    };
  }
  
  const personalizationKeys = new Set<string>();
  const customFieldKeys = new Set<string>();
  
  contacts.forEach(contact => {
    if (contact.personalizationData) {
      Object.keys(contact.personalizationData).forEach(key => {
        if (key.trim()) personalizationKeys.add(key);
      });
    }
    if (contact.customFields) {
      Object.keys(contact.customFields).forEach(key => {
        if (key.trim()) customFieldKeys.add(key);
      });
    }
  });
  
  return {
    standard,
    personalization: Array.from(personalizationKeys).sort(),
    customFields: Array.from(customFieldKeys).sort()
  };
}