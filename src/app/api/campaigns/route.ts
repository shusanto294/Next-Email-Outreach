import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
import EmailAccount from '@/models/EmailAccount';
import Contact from '@/models/Contact';
import connectDB from '@/lib/mongodb';

const sequenceSchema = z.object({
  stepNumber: z.number().min(1),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  delayDays: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  emailAccountIds: z.array(z.string()).optional(),
  sequences: z.array(sequenceSchema).min(1, 'At least one email sequence is required'),
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

    // Get contact counts for each campaign
    const campaignsWithContactCounts = await Promise.all(
      campaigns.map(async (campaign) => {
        const contactCount = await Contact.countDocuments({
          campaignId: campaign._id,
          userId: user._id
        });

        const campaignObj = campaign.toObject();
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
    console.log('Contacts in request:', data.contacts?.length, data.contacts);
    
    const validatedData = campaignSchema.parse(data);
    console.log('Data validation passed');
    console.log('Validated contacts:', validatedData.contacts?.length, validatedData.contacts);

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

    // Populate the response
    await campaign.populate('emailAccountIds', 'email provider fromName replyToEmail');

    return NextResponse.json({
      message: 'Campaign created successfully',
      campaign,
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      console.error('Zod validation error:', error.errors);
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create campaign error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    }, { status: 500 });
  }
}