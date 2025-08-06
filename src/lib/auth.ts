import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import User, { IUser } from '@/models/User';
import connectDB from './mongodb';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function authenticateUser(req: NextRequest): Promise<IUser | null> {
  try {
    console.log('🔐 Starting authentication...');
    const authHeader = req.headers.get('authorization');
    console.log('Auth header:', authHeader ? 'Bearer ***' : 'null');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Invalid auth header');
      return null;
    }

    const token = authHeader.substring(7);
    console.log('Token length:', token.length);
    
    const payload = verifyToken(token);
    console.log('Token payload:', payload ? { userId: payload.userId } : null);
    
    if (!payload) {
      console.log('❌ Token verification failed');
      return null;
    }

    await connectDB();
    console.log('🔍 Looking for user:', payload.userId);
    
    const user = await User.findById(payload.userId).select('-password');
    console.log('User found:', user ? { id: user._id, email: user.email } : null);
    
    return user;
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return null;
  }
}

export async function createUser(userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<IUser> {
  await connectDB();
  
  const existingUser = await User.findOne({ email: userData.email });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await hashPassword(userData.password);
  
  const user = new User({
    ...userData,
    password: hashedPassword,
  });

  await user.save();
  return user;
}

export async function loginUser(email: string, password: string): Promise<{ user: IUser; token: string }> {
  await connectDB();
  
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken(user._id.toString());
  
  // Remove password from user object
  const userWithoutPassword = await User.findById(user._id).select('-password');
  
  return { user: userWithoutPassword!, token };
}