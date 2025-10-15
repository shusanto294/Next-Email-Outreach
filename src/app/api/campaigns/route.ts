import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
import EmailAccount from '@/models/EmailAccount';
import Contact from '@/models/Contact';
import connectDB from '@/lib/mongodb';

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  emailAccountIds: z.array(z.string()).optional(),
  // Email fields directly in campaign
  subject: z.string().optional(),
  content: z.string().optional(),
  useAiForSubject: z.boolean().default(false),
  aiSubjectPrompt: z.string().optional(),
  useAiForContent: z.boolean().default(false),
  aiContentPrompt: z.string().optional(),
  contactIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  schedule: z.object({
    timezone: z.string().default('UTC'),
    sendingHours: z.object({
      start: z.string().default('09:00'),
      end: z.string().default('17:00'),
    }),
    sendingDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    emailDelaySeconds: z.number().min(1).default(60),
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

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const campaigns = await Campaign.find({ userId: user._id })
      .populate('emailAccountIds', 'email provider fromName replyToEmail')
      .sort({ createdAt: -1 });

    // Get contact counts for each campaign by querying contacts collection
    const campaignsWithContactCounts = await Promise.all(
      campaigns.map(async (campaign) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campaignObj = campaign.toObject() as any;

        // Count contacts that have this campaign's ID
        const contactCount = await Contact.countDocuments({
          campaignId: campaign._id
        });

        campaignObj.contactCount = contactCount;
        return campaignObj;
      })
    );

    return NextResponse.json({ campaigns: campaignsWithContactCounts });
  } catch (error) {
    console.error('Get campaigns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/campaigns - Starting...');
    
    const user = await authenticateUser(req);
    if (!user) {
      console.log('Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('User authenticated:', user._id);

    const data = await req.json();
    console.log('Request data:', data);
    console.log('Contact IDs in request:', data.contactIds?.length, data.contactIds);

    const validatedData = campaignSchema.parse(data);
    console.log('Data validation passed');
    console.log('Validated contact IDs:', validatedData.contactIds?.length, validatedData.contactIds);

    await connectDB();
    console.log('Database connected');

    // Verify email accounts if provided
    if (validatedData.emailAccountIds && validatedData.emailAccountIds.length > 0) {
      console.log('Looking for email accounts:', validatedData.emailAccountIds);
      const emailAccounts = await EmailAccount.find({
        _id: { $in: validatedData.emailAccountIds },
        userId: user._id,
      });
      console.log('Email accounts found:', emailAccounts.length);

      if (emailAccounts.length !== validatedData.emailAccountIds.length) {
        console.log('Some email accounts not found or do not belong to user');
        return NextResponse.json(
          { error: 'Some email accounts not found or do not belong to user' },
          { status: 400 }
        );
      }
    }

    // Verify contacts if provided
    if (validatedData.contactIds && validatedData.contactIds.length > 0) {
      console.log('Looking for contacts:', validatedData.contactIds);
      const contacts = await Contact.find({
        _id: { $in: validatedData.contactIds },
      });
      console.log('Contacts found:', contacts.length);

      if (contacts.length !== validatedData.contactIds.length) {
        console.log('Some contacts not found');
        return NextResponse.json(
          { error: 'Some contacts not found' },
          { status: 400 }
        );
      }
    }

    console.log('Creating campaign with data:', {
      ...validatedData,
      userId: user._id,
    });
    
    const campaign = new Campaign({
      ...validatedData,
      userId: user._id,
    });

    console.log('Campaign model created, saving...');
    await campaign.save();
    console.log('Campaign saved successfully');

    // If campaign has contacts, set hasUpcomingSequence=true for all contacts
    if (validatedData.contactIds && validatedData.contactIds.length > 0) {
      try {
        const contactUpdateResult = await Contact.updateMany(
          { _id: { $in: validatedData.contactIds } },
          { $set: { hasUpcomingSequence: true } }
        );
        console.log(`Updated hasUpcomingSequence for ${contactUpdateResult.modifiedCount} contacts`);
      } catch (contactUpdateError) {
        console.error('Error updating contacts hasUpcomingSequence:', contactUpdateError);
        // Don't fail the request if contact updates fail
      }
    }

    // Populate the response
    await campaign.populate('emailAccountIds', 'email provider fromName replyToEmail');

    return NextResponse.json({
      message: 'Campaign created successfully',
      campaign,
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error('Zod validation error:', error);
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create campaign error:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
    }

    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined 
    }, { status: 500 });
  }
}