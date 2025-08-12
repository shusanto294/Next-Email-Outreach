import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IEmailAccount extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  provider: 'gmail' | 'outlook' | 'smtp' | 'other';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  fromName?: string;
  replyToEmail?: string;
  dailyLimit: number;
  sentToday: number;
  lastResetDate: Date;
  isActive: boolean;
  isWarmedUp: boolean;
  reputation: number;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailAccountSchema = new Schema<IEmailAccount>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    provider: {
      type: String,
      enum: ['gmail', 'outlook', 'smtp', 'other'],
      required: true,
    },
    smtpHost: {
      type: String,
      required: true,
    },
    smtpPort: {
      type: Number,
      required: true,
      default: 587,
    },
    smtpSecure: {
      type: Boolean,
      default: false,
    },
    smtpUsername: {
      type: String,
      required: true,
    },
    smtpPassword: {
      type: String,
      required: true,
    },
    imapHost: {
      type: String,
      required: true,
    },
    imapPort: {
      type: Number,
      required: true,
      default: 993,
    },
    imapSecure: {
      type: Boolean,
      required: true,
      default: true,
    },
    fromName: {
      type: String,
      trim: true,
    },
    replyToEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    dailyLimit: {
      type: Number,
      default: 50,
    },
    sentToday: {
      type: Number,
      default: 0,
    },
    lastResetDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isWarmedUp: {
      type: Boolean,
      default: false,
    },
    reputation: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    lastUsed: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

EmailAccountSchema.index({ userId: 1, email: 1 }, { unique: true });

const EmailAccount: Model<IEmailAccount> = 
  mongoose.models.EmailAccount || mongoose.model<IEmailAccount>('EmailAccount', EmailAccountSchema);

export default EmailAccount;