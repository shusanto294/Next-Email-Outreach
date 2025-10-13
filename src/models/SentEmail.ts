import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISentEmail extends Document {
  userId: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId;
  emailAccountId: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;

  // Email details
  from: string;
  to: string;
  subject: string;
  content: string;
  htmlContent?: string;

  // Metadata
  messageId?: string; // Unique message ID from email provider
  threadId?: string; // For threading conversations
  inReplyTo?: string; // For reply chains

  // Tracking
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  sentAt: Date;
  deliveredAt?: Date;
  opened?: boolean;
  openedAt?: Date;
  clicked?: boolean;
  clickedAt?: Date;

  // AI Generation flags
  wasAiGenerated: boolean;
  aiGeneratedSubject?: boolean;
  aiGeneratedContent?: boolean;

  // Error handling
  error?: string;

  createdAt: Date;
  updatedAt: Date;
}

const SentEmailSchema = new Schema<ISentEmail>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      index: true,
    },
    emailAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAccount',
      required: true,
      index: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      index: true,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    htmlContent: {
      type: String,
    },
    messageId: {
      type: String,
      index: true,
    },
    threadId: {
      type: String,
      index: true,
    },
    inReplyTo: {
      type: String,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'bounced'],
      default: 'sent',
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deliveredAt: {
      type: Date,
    },
    opened: {
      type: Boolean,
      default: false,
    },
    openedAt: {
      type: Date,
    },
    clicked: {
      type: Boolean,
      default: false,
    },
    clickedAt: {
      type: Date,
    },
    wasAiGenerated: {
      type: Boolean,
      default: false,
    },
    aiGeneratedSubject: {
      type: Boolean,
      default: false,
    },
    aiGeneratedContent: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
SentEmailSchema.index({ userId: 1, sentAt: -1 });
SentEmailSchema.index({ emailAccountId: 1, sentAt: -1 });
SentEmailSchema.index({ campaignId: 1, sentAt: -1 });
SentEmailSchema.index({ threadId: 1, sentAt: 1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.SentEmail) {
  delete mongoose.models.SentEmail;
}

const SentEmail: Model<ISentEmail> = mongoose.model<ISentEmail>('SentEmail', SentEmailSchema);

export default SentEmail;
