import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IEmailLog extends Document {
  userId: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  emailAccountId: mongoose.Types.ObjectId;
  sequenceStep: number;
  messageId: string;
  subject: string;
  content: string;
  status: 'scheduled' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;
  bouncedAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  openCount: number;
  clickCount: number;
  trackingPixelUrl?: string;
  unsubscribeUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    },
    emailAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAccount',
      required: true,
    },
    sequenceStep: {
      type: Number,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'],
      default: 'scheduled',
    },
    scheduledAt: Date,
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    repliedAt: Date,
    bouncedAt: Date,
    failedAt: Date,
    errorMessage: String,
    openCount: {
      type: Number,
      default: 0,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
    trackingPixelUrl: String,
    unsubscribeUrl: String,
  },
  {
    timestamps: true,
  }
);

EmailLogSchema.index({ userId: 1, campaignId: 1 });
EmailLogSchema.index({ contactId: 1, campaignId: 1 });
EmailLogSchema.index({ status: 1, scheduledAt: 1 });
EmailLogSchema.index({ messageId: 1 }, { unique: true });

const EmailLog: Model<IEmailLog> = 
  mongoose.models.EmailLog || mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);

export default EmailLog;