import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { initializeApp } from '@/lib/startup';

export async function GET(req: NextRequest) {
  // Initialize app on first API call
  await initializeApp();
  
  try {
    const user = await authenticateUser(req);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        emailsSent: user.emailsSent,
        emailsLimit: user.emailsLimit,
        aiProvider: user.aiProvider,
        openaiApiKey: user.openaiApiKey,
        openaiModel: user.openaiModel,
        deepseekApiKey: user.deepseekApiKey,
        deepseekModel: user.deepseekModel,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}