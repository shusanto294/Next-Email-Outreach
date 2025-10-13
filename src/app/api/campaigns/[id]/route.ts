import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
import Contact from '@/models/Contact';
import EmailAccount from '@/models/EmailAccount';
import connectDB from '@/lib/mongodb';

const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').optional(),
  emailAccountIds: z.array(z.string()).optional(),
  // Email fields directly in campaign
  subject: z.string().optional(),
  content: z.string().optional(),
  useAiForSubject: z.boolean().optional(),
  aiSubjectPrompt: z.string().optional(),
  useAiForContent: z.boolean().optional(),
  aiContentPrompt: z.string().optional(),
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
    
    // Validate data
    const validatedData = updateCampaignSchema.parse(data);
    
    await connectDB();
    
    const { id } = await params;
    
    // Verify email accounts if provided
    if (validatedData.emailAccountIds && validatedData.emailAccountIds.length > 0) {
      const emailAccounts = await EmailAccount.find({
        _id: { $in: validatedData.emailAccountIds },
        userId: user._id,
      });

      if (emailAccounts.length !== validatedData.emailAccountIds.length) {
        return NextResponse.json(
          { error: 'Some email accounts not found or do not belong to user' },
          { status: 400 }
        );
      }
    }
    
    // Use findOneAndUpdate with validation
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: validatedData },
      { new: true, runValidators: true }
    ).populate('emailAccountIds', 'email provider fromName replyToEmail')
     .populate('contactIds', 'email firstName lastName company');

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }


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