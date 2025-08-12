import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import Campaign from '@/models/Campaign';
import connectDB from '@/lib/mongodb';

// POST bulk import contacts
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contacts, campaignId } = await req.json();

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'Contacts array is required' }, { status: 400 });
    }

    if (campaignId && typeof campaignId !== 'string') {
      return NextResponse.json({ error: 'Campaign ID must be a valid string' }, { status: 400 });
    }

    await connectDB();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validContacts = [];
    const errors = [];
    const existingEmails = new Set();

    // Get existing emails for this user
    const existingContactsFromDB = await Contact.find({
      userId: user._id
    }, 'email');
    
    existingContactsFromDB.forEach(contact => {
      existingEmails.add(contact.email);
    });

    // Validate and process each contact
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowNumber = i + 1;

      if (!contact.email || !contact.email.trim()) {
        errors.push(`Row ${rowNumber}: Email is required`);
        continue;
      }

      const email = contact.email.toLowerCase().trim();

      if (!emailRegex.test(email)) {
        errors.push(`Row ${rowNumber}: Invalid email format - ${email}`);
        continue;
      }

      if (existingEmails.has(email)) {
        errors.push(`Row ${rowNumber}: Email already exists - ${email}`);
        continue;
      }

      // Add to existing emails set to prevent duplicates within this import
      existingEmails.add(email);

      const contactData: Record<string, unknown> = {
        userId: user._id,
        email,
        firstName: contact.firstName?.trim(),
        lastName: contact.lastName?.trim(),
        company: contact.company?.trim(),
        position: contact.position?.trim(),
        phone: contact.phone?.trim(),
        website: contact.website?.trim(),
        linkedin: contact.linkedin?.trim(),
        companyLinkedin: contact.companyLinkedin?.trim(),
        personalization: contact.personalization?.trim(),
        source: contact.source?.trim() || 'CSV Import',
        notes: contact.notes?.trim(),
      };

      // Note: We no longer set campaignId on individual contacts

      validContacts.push(contactData);
    }

    const importedContacts = [];
    let importedCount = 0;
    if (validContacts.length > 0) {
      // Insert valid contacts in batches
      const batchSize = 100;
      for (let i = 0; i < validContacts.length; i += batchSize) {
        const batch = validContacts.slice(i, i + batchSize);
        const insertedContacts = await Contact.insertMany(batch);
        importedContacts.push(...insertedContacts);
        importedCount += batch.length;
      }

      // If campaignId is provided, add contact IDs to the campaign
      if (campaignId && importedContacts.length > 0) {
        const contactIds = importedContacts.map(contact => contact._id);
        
        await Campaign.findByIdAndUpdate(
          campaignId,
          { 
            $addToSet: { 
              contactIds: { $each: contactIds } 
            } 
          },
          { new: true }
        );
        
        console.log(`Added ${contactIds.length} contact IDs to campaign ${campaignId}`);
        
        // Set hasUpcomingSequence=true for all newly imported contacts
        try {
          await Contact.updateMany(
            { _id: { $in: contactIds } },
            { $set: { hasUpcomingSequence: true } }
          );
          console.log(`Set hasUpcomingSequence=true for ${contactIds.length} imported contacts`);
        } catch (updateError) {
          console.error('Error setting hasUpcomingSequence for imported contacts:', updateError);
          // Don't fail the import if this update fails
        }
      }
    }

    return NextResponse.json({
      message: `Import completed. ${importedCount} contacts imported successfully.`,
      imported: importedCount,
      contacts: importedContacts,
      errors: errors.length > 0 ? errors : undefined,
      total: contacts.length,
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}