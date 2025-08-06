import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Campaign from '@/models/Campaign';
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

    return NextResponse.json({ campaign });
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
    console.log('- Contacts length:', data.contacts?.length || 0);
    if (data.contacts && data.contacts.length > 0) {
      console.log('- Sample contact received:', data.contacts[0]);
      console.log('- First 3 contact emails:', data.contacts.slice(0, 3).map(c => c.email));
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
    
    console.log('📊 Current campaign contacts:', currentCampaign?.contacts?.length || 0);
    console.log('📊 Data to update with:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    
    // Use findOneAndUpdate with validation
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: data },
      { new: true, runValidators: true }
    ).populate('emailAccountIds', 'email provider fromName replyToEmail');

    if (!campaign) {
      console.error('❌ Campaign update failed - not found after update');
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    console.log('✅ API: Campaign updated successfully');
    console.log('- Updated campaign contacts:', campaign.contacts?.length || 0);
    if (campaign.contacts && campaign.contacts.length > 0) {
      console.log('- Sample updated contact:', campaign.contacts[0]);
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
    const campaign = await Campaign.findOneAndDelete({
      _id: id,
      userId: user._id,
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}