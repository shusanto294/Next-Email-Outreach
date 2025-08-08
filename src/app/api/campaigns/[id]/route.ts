import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
import Contact from '@/models/Contact';
import connectDB from '@/lib/mongodb';

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
    console.log('- Contact IDs length:', data.contactIds?.length || 0);
    if (data.contactIds && data.contactIds.length > 0) {
      console.log('- Contact IDs:', data.contactIds.slice(0, 3));
    }
    
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
    
    console.log('📊 Current campaign contactIds:', currentCampaign?.contactIds?.length || 0);
    console.log('📊 Data to update with:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    
    // Use findOneAndUpdate with validation
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: data },
      { new: true, runValidators: true }
    ).populate('emailAccountIds', 'email provider fromName replyToEmail')
     .populate('contactIds', 'email firstName lastName company');

    if (!campaign) {
      console.error('❌ Campaign update failed - not found after update');
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    console.log('✅ API: Campaign updated successfully');
    console.log('- Updated campaign contactIds:', campaign.contactIds?.length || 0);
    if (campaign.contactIds && campaign.contactIds.length > 0) {
      console.log('- Contact IDs:', campaign.contactIds.slice(0, 3));
    }

    return NextResponse.json({
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error) {
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