import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import EmailAccount from '@/models/EmailAccount';

export async function POST(req: NextRequest) {
  try {
    console.log('=== DEBUG ENDPOINT CALLED ===');
    
    // Test authentication
    const user = await authenticateUser(req);
    if (!user) {
      console.log('❌ Authentication failed');
      return NextResponse.json({ error: 'Unauthorized', step: 'auth' }, { status: 401 });
    }
    console.log('✅ Authentication successful:', user._id);

    // Test database connection
    await connectDB();
    console.log('✅ Database connection successful');

    // Test email account lookup
    const emailAccounts = await EmailAccount.find({ userId: user._id });
    console.log('✅ Email accounts found:', emailAccounts.length);

    return NextResponse.json({
      message: 'Debug successful',
      user: { id: user._id, email: user.email },
      emailAccountsCount: emailAccounts.length,
      emailAccounts: emailAccounts.map(acc => ({
        id: acc._id,
        email: acc.email,
        provider: acc.provider,
        fromName: acc.fromName,
        replyToEmail: acc.replyToEmail
      }))
    });

  } catch (error: unknown) {
    console.error('❌ Debug endpoint error:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      return NextResponse.json({
        error: 'Debug failed',
        details: error.message,
        errorName: error.name
      }, { status: 500 });
    }

    return NextResponse.json({
      error: 'Debug failed',
      details: 'Unknown error'
    }, { status: 500 });
  }
}