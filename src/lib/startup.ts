import connectDB from '@/lib/mongodb';

let isInitialized = false;

export async function initializeApp() {
  if (isInitialized) {
    return;
  }

  try {
    console.log('🚀 Initializing application...');
    
    // Connect to database
    await connectDB();
    console.log('✅ Database connected');

    isInitialized = true;
    console.log('✅ Application initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    throw error;
  }
}

export function getInitializationStatus() {
  return isInitialized;
}