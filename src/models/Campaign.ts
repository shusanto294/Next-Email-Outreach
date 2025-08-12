import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IEmailSequence {
  stepNumber: number;
  subject: string;
  content: string;
  nextEmailAfter: number;
  isActive: boolean;
  useAiForSubject?: boolean;
  aiSubjectPrompt?: string;
  useAiForContent?: boolean;
  aiContentPrompt?: string;
}

export interface ICampaign extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  emailAccountIds: mongoose.Types.ObjectId[];
  sequences: IEmailSequence[];
  contactIds: mongoose.Types.ObjectId[];
  customVariables?: Array<{
    name: string;
    defaultValue: string;
  }>;
  isActive: boolean;
  mode: 'test' | 'live';
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

const EmailSequenceSchema = new Schema<IEmailSequence>({
  stepNumber: {
    type: Number,
    required: true,
  },
  subject: {
    type: String,
    required: false,
  },
  content: {
    type: String,
    required: false,
  },
  nextEmailAfter: {
    type: Number,
    default: 7,
  },
  isActive: {
    type: Boolean,
    default: true,
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
});

// Add custom validation to ensure either manual or AI fields are provided
EmailSequenceSchema.pre('validate', function() {
  // Ensure nextEmailAfter has a default value
  if (this.nextEmailAfter === undefined || this.nextEmailAfter === null) {
    this.nextEmailAfter = 7;
  }
  
  // Subject validation
  if (!this.useAiForSubject && (!this.subject || this.subject.trim().length === 0)) {
    this.invalidate('subject', 'Subject is required when not using AI for subject');
  }
  if (this.useAiForSubject && (!this.aiSubjectPrompt || this.aiSubjectPrompt.trim().length === 0)) {
    this.invalidate('aiSubjectPrompt', 'AI subject prompt is required when using AI for subject');
  }
  
  // Content validation
  if (!this.useAiForContent && (!this.content || this.content.trim().length === 0)) {
    this.invalidate('content', 'Content is required when not using AI for content');
  }
  if (this.useAiForContent && (!this.aiContentPrompt || this.aiContentPrompt.trim().length === 0)) {
    this.invalidate('aiContentPrompt', 'AI content prompt is required when using AI for content');
  }
});

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
    sequences: [EmailSequenceSchema],
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
    mode: {
      type: String,
      enum: ['test', 'live'],
      default: 'test',
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