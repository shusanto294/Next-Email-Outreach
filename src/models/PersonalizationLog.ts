import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IWebsiteData {
  url: string;
  title: string;
  description: string;
  main_content: string;
  headings: string[];
  paragraphs: string[];
  about_section: string;
  services_section: string;
  team_section: string;
  testimonials: string;
  key_phrases: string[];
  contact_info: string;
  full_text_summary: string;
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
  processingTime?: number;
  createdAt: Date;
}

const WebsiteDataSchema = new Schema<IWebsiteData>({
  url: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  main_content: { type: String, default: '' },
  headings: [{ type: String }],
  paragraphs: [{ type: String }],
  about_section: { type: String, default: '' },
  services_section: { type: String, default: '' },
  team_section: { type: String, default: '' },
  testimonials: { type: String, default: '' },
  key_phrases: [{ type: String }],
  contact_info: { type: String, default: '' },
  full_text_summary: { type: String, default: '' }
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