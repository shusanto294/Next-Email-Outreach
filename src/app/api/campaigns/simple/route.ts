import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Campaign from '@/models/Campaign';

export async function POST(req: NextRequest) {
  try {
    console.log('=== SIMPLE CAMPAIGN CREATION ===');
    
    const user = await authenticateUser(req);
    if (!user) {
      console.log('❌ Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('✅ User authenticated:', user._id);

    const data = await req.json();
    console.log('📝 Request data:', JSON.stringify(data, null, 2));

    await connectDB();
    console.log('✅ Database connected');

    // Create minimal campaign with just required fields - explicitly exclude old fields
    const campaignData = {
      userId: user._id,
      name: data.name || 'Test Campaign',
      emailAccountId: data.emailAccountId,
      sequences: data.sequences || [{
        stepNumber: 1,
        subject: 'Test Subject',
        content: 'Test Content',
        // Let the model default handle nextEmailAfter
        isActive: true
      }],
      contacts: [], // Start with empty contacts array
      isActive: data.isActive !== undefined ? data.isActive : true,
      schedule: {
        timezone: 'UTC',
        sendingHours: {
          start: '09:00',
          end: '17:00'
        },
        sendingDays: [1, 2, 3, 4, 5],
        emailsPerDay: 50
      },
      trackOpens: data.trackOpens !== undefined ? data.trackOpens : true,
      trackClicks: data.trackClicks !== undefined ? data.trackClicks : true,
      unsubscribeLink: data.unsubscribeLink !== undefined ? data.unsubscribeLink : true,
      stats: {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
        complained: 0
      }
    };

    console.log('📝 Campaign data to save:', JSON.stringify(campaignData, null, 2));

    const campaign = new Campaign(campaignData);
    console.log('✅ Campaign model created');

    await campaign.save();
    console.log('✅ Campaign saved to database');

    return NextResponse.json({
      message: 'Simple campaign created successfully',
      campaignId: campaign._id,
      campaign: {
        id: campaign._id,
        name: campaign.name,
        isActive: campaign.isActive
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('❌ Simple campaign creation error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return NextResponse.json({ 
      error: 'Simple campaign creation failed', 
      details: error.message,
      errorType: error.name
    }, { status: 500 });
  }
}