import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import Campaign from '@/models/Campaign';
import connectDB from '@/lib/mongodb';

// GET all contacts for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    const status = searchParams.get('status');
    const sentFilter = searchParams.get('sent');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');

    await connectDB();

    // Build query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { userId: user._id };

    // If campaignId is provided, filter contacts by campaignId
    if (campaignId) {
      // Verify campaign exists and belongs to user
      const campaign = await Campaign.findOne({
        _id: campaignId,
        userId: user._id
      });

      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      // Filter contacts that have this campaignId
      query.campaignId = campaignId;
    }
    
    if (status) {
      query.status = status;
    }

    // Filter by sent status: 'sent' means sent > 0, 'not-sent' means sent = 0
    if (sentFilter) {
      if (sentFilter === 'sent') {
        query.sent = { $gt: 0 };
      } else if (sentFilter === 'not-sent') {
        query.sent = 0;
      }
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

    // Get contacts with pagination and populate campaign data
    const contacts = await Contact.find(query)
      .populate('campaignId', 'name')
      .sort({ createdAt: -1 })
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
    const { campaignId, email } = contactData;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    await connectDB();

    // Check if campaign exists and belongs to user (if campaignId provided)
    let campaign = null;
    if (campaignId) {
      campaign = await Campaign.findOne({
        _id: campaignId,
        userId: user._id
      });

      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactPayload: any = {
      userId: user._id,
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
      notes: contactData.notes?.trim(),
    };

    if (campaignId) {
      contactPayload.campaignId = campaignId;
    }

    const newContact = new Contact(contactPayload);
    await newContact.save();

    // If campaignId provided, add this contact to the campaign's contactIds array
    if (campaignId && campaign) {
      await Campaign.findByIdAndUpdate(
        campaignId,
        { 
          $addToSet: { 
            contactIds: newContact._id 
          } 
        },
        { new: true }
      );
    }

    return NextResponse.json({
      message: 'Contact created successfully',
      contact: newContact
    }, { status: 201 });
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH update contacts' hasUpcomingSequence field for a campaign
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId, hasUpcomingSequence } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    if (typeof hasUpcomingSequence !== 'boolean') {
      return NextResponse.json({ error: 'hasUpcomingSequence must be a boolean' }, { status: 400 });
    }

    await connectDB();

    // Verify campaign exists and belongs to user
    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: user._id
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Find all contacts for this campaign that currently have hasUpcomingSequence=false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {
      userId: user._id,
      hasUpcomingSequence: false
    };

    // Only update contacts that are in the campaign's contactIds array
    if (campaign.contactIds && campaign.contactIds.length > 0) {
      query._id = { $in: campaign.contactIds };
    } else {
      // No contacts in this campaign
      return NextResponse.json({
        message: 'No contacts found in campaign',
        updatedCount: 0
      });
    }

    // Update contacts' hasUpcomingSequence field
    const updateResult = await Contact.updateMany(
      query,
      { $set: { hasUpcomingSequence } }
    );

    return NextResponse.json({
      message: `Updated ${updateResult.modifiedCount} contacts`,
      updatedCount: updateResult.modifiedCount
    });

  } catch (error) {
    console.error('Update contacts hasUpcomingSequence error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}