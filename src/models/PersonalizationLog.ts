import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IWebsiteData {
  url: string;
  websiteContent: string;
}

export interface IContactData {
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  personalization?: string;
}

export interface IFullPromptData {
  systemPrompt: string;
  contactContext: string;
  userPrompt: string;
  fullPrompt: string;
}

export interface IPersonalizationLog extends Document {
  userId: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  sequenceStep: number;
  personalizationType: 'subject' | 'content';
  aiProvider: 'openai' | 'deepseek' | 'manual';
  aiModel?: string;
  originalPrompt: string;
  personalizedResult: string;
  websiteData?: IWebsiteData;
  contactData?: IContactData;
  fullPromptData?: IFullPromptData;
  processingTime?: number;
  createdAt: Date;
}

const WebsiteDataSchema = new Schema<IWebsiteData>({
  url: { type: String, required: true },
  websiteContent: { type: String, default: '' }
});

const ContactDataSchema = new Schema<IContactData>({
  firstName: { type: String },
  lastName: { type: String },
  company: { type: String },
  position: { type: String },
  email: { type: String },
  phone: { type: String },
  website: { type: String },
  city: { type: String },
  state: { type: String },
  country: { type: String },
  industry: { type: String },
  personalization: { type: String }
});

const FullPromptDataSchema = new Schema<IFullPromptData>({
  systemPrompt: { type: String, required: true },
  contactContext: { type: String, required: true },
  userPrompt: { type: String, required: true },
  fullPrompt: { type: String, required: true }
});

const PersonalizationLogSchema = new Schema<IPersonalizationLog>(
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
    sequenceStep: {
      type: Number,
      required: true,
    },
    personalizationType: {
      type: String,
      enum: ['subject', 'content'],
      required: true,
    },
    aiProvider: {
      type: String,
      enum: ['openai', 'deepseek', 'manual'],
      required: true,
    },
    aiModel: {
      type: String,
      trim: true,
    },
    originalPrompt: {
      type: String,
      required: true,
    },
    personalizedResult: {
      type: String,
      required: true,
    },
    websiteData: WebsiteDataSchema,
    contactData: ContactDataSchema,
    fullPromptData: FullPromptDataSchema,
    processingTime: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Add indexes for efficient querying
PersonalizationLogSchema.index({ userId: 1, campaignId: 1 });
PersonalizationLogSchema.index({ contactId: 1, sequenceStep: 1 });
PersonalizationLogSchema.index({ createdAt: -1 });
PersonalizationLogSchema.index({ aiProvider: 1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.PersonalizationLog) {
  delete mongoose.models.PersonalizationLog;
}

const PersonalizationLog: Model<IPersonalizationLog> = mongoose.model<IPersonalizationLog>('PersonalizationLog', PersonalizationLogSchema);

export default PersonalizationLog;