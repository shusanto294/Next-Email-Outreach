import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    console.log('Test endpoint called');
    return NextResponse.json({ message: 'API is working', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('Test POST endpoint called');
    const data = await req.json();
    console.log('Test POST data:', data);
    return NextResponse.json({ message: 'POST test successful', receivedData: data });
  } catch (error) {
    console.error('Test POST endpoint error:', error);
    return NextResponse.json({ error: 'Test POST failed' }, { status: 500 });
  }
}