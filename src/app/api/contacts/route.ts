import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import List from '@/models/List';
import connectDB from '@/lib/mongodb';

// GET all contacts for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const listId = searchParams.get('listId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');

    await connectDB();

    // Build query
    const query: any = { userId: user._id };
    
    if (listId) {
      query.listId = listId;
    }
    
    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    // Get total count
    const total = await Contact.countDocuments(query);

    // Get contacts with pagination
    const contacts = await Contact.find(query)
      .populate('listId', 'name')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create a new contact
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contactData = await req.json();
    const { listId, email } = contactData;

    if (!listId || !email) {
      return NextResponse.json({ error: 'List ID and email are required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
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

    // Check if contact with this email already exists for this user
    const existingContact = await Contact.findOne({
      userId: user._id,
      email: email.toLowerCase().trim()
    });

    if (existingContact) {
      return NextResponse.json({ error: 'Contact with this email already exists' }, { status: 400 });
    }

    // Create new contact
    const newContact = new Contact({
      userId: user._id,
      listId,
      email: email.toLowerCase().trim(),
      firstName: contactData.firstName?.trim(),
      lastName: contactData.lastName?.trim(),
      company: contactData.company?.trim(),
      position: contactData.position?.trim(),
      phone: contactData.phone?.trim(),
      website: contactData.website?.trim(),
      linkedin: contactData.linkedin?.trim(),
      companyLinkedin: contactData.companyLinkedin?.trim(),
      personalization: contactData.personalization?.trim(),
      source: contactData.source?.trim(),
      notes: contactData.notes?.trim(),
    });

    await newContact.save();

    // Update list contact count
    await List.findByIdAndUpdate(listId, {
      $inc: { contactCount: 1 }
    });

    return NextResponse.json({
      message: 'Contact created successfully',
      contact: newContact
    }, { status: 201 });
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}