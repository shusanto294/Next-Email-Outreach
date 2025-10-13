import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ICampaign extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  emailAccountIds: mongoose.Types.ObjectId[];
  // Email fields directly in campaign
  subject?: string;
  content?: string;
  useAiForSubject?: boolean;
  aiSubjectPrompt?: string;
  useAiForContent?: boolean;
  aiContentPrompt?: string;
  contactIds: mongoose.Types.ObjectId[];
  customVariables?: Array<{
    name: string;
    defaultValue: string;
  }>;
  isActive: boolean;
  schedule: {
    sendingHours: {
      start: string;
      end: string;
    };
    sendingDays: number[];
    emailDelaySeconds: number;
  };
  trackOpens: boolean;
  trackClicks: boolean;
  unsubscribeLink: boolean;
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    emailAccountIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAccount',
    }],
    // Email fields directly in campaign
    subject: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      trim: true,
    },
    useAiForSubject: {
      type: Boolean,
      default: false,
    },
    aiSubjectPrompt: {
      type: String,
      trim: true,
    },
    useAiForContent: {
      type: Boolean,
      default: false,
    },
    aiContentPrompt: {
      type: String,
      trim: true,
    },
    contactIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    }],
    customVariables: [{
      name: {
        type: String,
        required: false,
        trim: true,
      },
      defaultValue: {
        type: String,
        default: '',
        trim: true,
      },
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    schedule: {
      sendingHours: {
        start: {
          type: String,
          default: '09:00',
        },
        end: {
          type: String,
          default: '17:00',
        },
      },
      sendingDays: [{
        type: Number,
        min: 0,
        max: 6,
      }],
      emailDelaySeconds: {
        type: Number,
        default: 60,
        min: 1,
      },
    },
    trackOpens: {
      type: Boolean,
      default: true,
    },
    trackClicks: {
      type: Boolean,
      default: true,
    },
    unsubscribeLink: {
      type: Boolean,
      default: true,
    },
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
      complained: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

CampaignSchema.index({ userId: 1, isActive: 1 });
CampaignSchema.index({ userId: 1, createdAt: -1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.Campaign) {
  delete mongoose.models.Campaign;
}

const Campaign: Model<ICampaign> = mongoose.model<ICampaign>('Campaign', CampaignSchema);

export default Campaign;