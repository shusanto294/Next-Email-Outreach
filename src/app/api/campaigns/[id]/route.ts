import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
import Contact from '@/models/Contact';
import EmailAccount from '@/models/EmailAccount';
import connectDB from '@/lib/mongodb';

const sequenceSchema = z.object({
  stepNumber: z.number().min(1),
  subject: z.string().optional(),
  content: z.string().optional(),
  delayDays: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  useAiForSubject: z.boolean().default(false),
  aiSubjectPrompt: z.string().optional(),
  useAiForContent: z.boolean().default(false),
  aiContentPrompt: z.string().optional(),
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

const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').optional(),
  description: z.string().optional(),
  emailAccountIds: z.array(z.string()).optional(),
  sequences: z.array(sequenceSchema).min(1, 'At least one email sequence is required').optional(),
  contactIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  schedule: z.object({
    sendingHours: z.object({
      start: z.string().default('09:00'),
      end: z.string().default('17:00'),
    }),
    sendingDays: z.array(z.coerce.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    emailDelaySeconds: z.coerce.number().min(1).default(60),
  }).optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  unsubscribeLink: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const { id } = await params;
    const campaign = await Campaign.findOne({
      _id: id,
      userId: user._id,
    })
      .populate('emailAccountIds', 'email provider fromName replyToEmail');

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get the actual contact count for this campaign from contactIds array
    const contactCount = campaign.contactIds ? campaign.contactIds.length : 0;

    const campaignObj = campaign.toObject();
    campaignObj.contactCount = contactCount;

    return NextResponse.json({ campaign: campaignObj });
  } catch (error) {
    console.error('Get campaign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    console.log('🔄 API: Updating campaign with data:');
    console.log('- Data keys:', Object.keys(data));
    console.log('- Email Account IDs:', data.emailAccountIds);
    console.log('- Is Active:', data.isActive);
    console.log('- Schedule:', data.schedule);
    
    // Validate data
    const validatedData = updateCampaignSchema.parse(data);
    console.log('✅ Data validation passed');
    
    await connectDB();
    
    const { id } = await params;
    console.log('📋 Campaign ID:', id);
    console.log('👤 User ID:', user._id);
    
    // First get the current campaign to see what's being updated
    const currentCampaign = await Campaign.findOne({ _id: id, userId: user._id });
    if (!currentCampaign) {
      console.error('❌ Campaign not found for user');
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

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
    
    console.log('📊 Current campaign contactIds:', currentCampaign?.contactIds?.length || 0);
    console.log('📊 Validated data to update with:', JSON.stringify(validatedData, null, 2));
    
    // Use findOneAndUpdate with validation
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: validatedData },
      { new: true, runValidators: true }
    ).populate('emailAccountIds', 'email provider fromName replyToEmail')
     .populate('contactIds', 'email firstName lastName company');

    if (!campaign) {
      console.error('❌ Campaign update failed - not found after update');
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    console.log('✅ API: Campaign updated successfully');
    console.log('- Updated campaign emailAccountIds:', campaign.emailAccountIds?.length || 0);
    console.log('- Updated campaign isActive:', campaign.isActive);
    console.log('- Updated campaign schedule:', campaign.schedule);

    return NextResponse.json({
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      console.error('Zod validation error:', error.errors);
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update campaign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const { id } = await params;
    
    // First verify the campaign exists and belongs to the user
    const campaign = await Campaign.findOne({
      _id: id,
      userId: user._id,
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    console.log(`🗑️  Deleting campaign ${id} and its associated contacts...`);

    // Count contacts to be deleted for logging
    const contactCount = campaign.contactIds ? campaign.contactIds.length : 0;
    console.log(`📊 Found ${contactCount} contacts associated with campaign ${id}`);

    // Delete all contacts referenced by this campaign
    let deleteContactsResult = { deletedCount: 0 };
    if (campaign.contactIds && campaign.contactIds.length > 0) {
      deleteContactsResult = await Contact.deleteMany({ 
        _id: { $in: campaign.contactIds } 
      });
    }
    console.log(`✅ Deleted ${deleteContactsResult.deletedCount} contacts`);

    // Delete the campaign
    await Campaign.findByIdAndDelete(id);
    console.log(`✅ Deleted campaign ${id}`);

    return NextResponse.json({ 
      message: `Campaign deleted successfully. Also deleted ${deleteContactsResult.deletedCount} associated contacts.`,
      deletedContactsCount: deleteContactsResult.deletedCount
    });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}