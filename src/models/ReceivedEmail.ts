import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IReceivedEmail extends Document {
  userId: mongoose.Types.ObjectId;
  emailAccountId: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId;

  // Email details
  from: string;
  to: string;
  subject: string;
  content: string;
  htmlContent?: string;

  // Metadata
  messageId: string; // Unique message ID from email provider
  threadId?: string; // For threading conversations
  inReplyTo?: string; // For reply chains
  references?: string[]; // All message IDs in the thread

  // Attachments
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url?: string;
  }>;

  // Status
  isRead: boolean;
  isSeen: boolean; // Whether user has viewed/previewed the email
  isStarred: boolean;
  isRepliedTo: boolean;
  isForwarded: boolean;

  // Classification
  category: 'inbox' | 'spam' | 'trash' | 'archive';
  isReply: boolean; // Is this a reply to one of our sent emails?
  sentEmailId?: mongoose.Types.ObjectId; // Reference to the sent email this is replying to

  // Dates
  receivedAt: Date;
  readAt?: Date;

  // Raw email data (optional, for debugging)
  rawHeaders?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ReceivedEmailSchema = new Schema<IReceivedEmail>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      index: true,
    },
    from: {
      type: String,
      required: true,
      index: true,
    },
    to: {
      type: String,
      required: true,
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
      required: true,
      unique: true,
      index: true,
    },
    threadId: {
      type: String,
      index: true,
    },
    inReplyTo: {
      type: String,
      index: true,
    },
    references: [{
      type: String,
    }],
    attachments: [{
      filename: String,
      contentType: String,
      size: Number,
      url: String,
    }],
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSeen: {
      type: Boolean,
      default: false,
      index: true,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    isRepliedTo: {
      type: Boolean,
      default: false,
    },
    isForwarded: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: ['inbox', 'spam', 'trash', 'archive'],
      default: 'inbox',
      index: true,
    },
    isReply: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentEmailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SentEmail',
      index: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    readAt: {
      type: Date,
    },
    rawHeaders: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
ReceivedEmailSchema.index({ userId: 1, receivedAt: -1 });
ReceivedEmailSchema.index({ emailAccountId: 1, receivedAt: -1 });
ReceivedEmailSchema.index({ userId: 1, isRead: 1, receivedAt: -1 });
ReceivedEmailSchema.index({ userId: 1, isSeen: 1, receivedAt: -1 });
ReceivedEmailSchema.index({ userId: 1, category: 1, receivedAt: -1 });
ReceivedEmailSchema.index({ threadId: 1, receivedAt: 1 });
ReceivedEmailSchema.index({ campaignId: 1, isReply: 1, receivedAt: -1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.ReceivedEmail) {
  delete mongoose.models.ReceivedEmail;
}

const ReceivedEmail: Model<IReceivedEmail> = mongoose.model<IReceivedEmail>('ReceivedEmail', ReceivedEmailSchema);

export default ReceivedEmail;
