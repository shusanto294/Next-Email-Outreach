import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import List from '@/models/List';
import connectDB from '@/lib/mongodb';

// POST bulk import contacts
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId, contacts } = await req.json();

    if (!listId || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'List ID and contacts array are required' }, { status: 400 });
    }

    await connectDB();

    // Check if list exists and belongs to user
    const list = await List.findOne({
      _id: listId,
      userId: user._id,
      isActive: true
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

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

      validContacts.push({
        userId: user._id,
        listId,
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
      });
    }

    let importedCount = 0;
    if (validContacts.length > 0) {
      // Insert valid contacts in batches
      const batchSize = 100;
      for (let i = 0; i < validContacts.length; i += batchSize) {
        const batch = validContacts.slice(i, i + batchSize);
        await Contact.insertMany(batch);
        importedCount += batch.length;
      }

      // Update list contact count
      await List.findByIdAndUpdate(listId, {
        $inc: { contactCount: importedCount }
      });
    }

    return NextResponse.json({
      message: `Import completed. ${importedCount} contacts imported successfully.`,
      imported: importedCount,
      errors: errors.length > 0 ? errors : undefined,
      total: contacts.length,
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}