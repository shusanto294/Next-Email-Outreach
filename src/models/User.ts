import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  emailsSent: number;
  emailsLimit: number;
  isActive: boolean;
  timezone?: string;
  aiProvider?: 'openai' | 'deepseek' | null;
  openaiApiKey?: string;
  openaiModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  ignoreKeywords?: string;
  emailCheckDelay?: number;
  emailSendDelay?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    emailsSent: {
      type: Number,
      default: 0,
    },
    emailsLimit: {
      type: Number,
      default: 100, // Free plan limit
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: 'UTC',
    },
    aiProvider: {
      type: String,
      enum: ['openai', 'deepseek', null],
      default: null,
    },
    openaiApiKey: {
      type: String,
      trim: true,
    },
    openaiModel: {
      type: String,
      trim: true,
      default: 'gpt-4o-mini',
    },
    deepseekApiKey: {
      type: String,
      trim: true,
    },
    deepseekModel: {
      type: String,
      trim: true,
      default: 'deepseek-chat',
    },
    ignoreKeywords: {
      type: String,
      trim: true,
      default: '',
    },
    emailCheckDelay: {
      type: Number,
      default: 30, // Default 30 seconds delay between email checks
    },
    emailSendDelay: {
      type: Number,
      default: 30, // Default 30 seconds delay between email sends
    },
  },
  {
    timestamps: true,
  }
);

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;