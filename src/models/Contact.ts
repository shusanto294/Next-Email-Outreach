import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IContact extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  companyLinkedin?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  revenue?: string;
  employees?: string;
  websiteContent?: string;
  personalization?: string;
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained' | 'do-not-contact';
  lastContacted?: Date;
  timesContacted: number;
  emailStatus: 'never-sent' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced';
  source?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    position: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    website: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    linkedin: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    companyLinkedin: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    revenue: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    employees: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    websiteContent: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    personalization: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['active', 'unsubscribed', 'bounced', 'complained', 'do-not-contact'],
      default: 'active',
    },
    lastContacted: {
      type: Date,
    },
    timesContacted: {
      type: Number,
      default: 0,
      min: 0,
    },
    emailStatus: {
      type: String,
      enum: ['never-sent', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'],
      default: 'never-sent',
    },
    source: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient queries
ContactSchema.index({ userId: 1, email: 1 }, { unique: true });
ContactSchema.index({ email: 1 });
ContactSchema.index({ status: 1 });
ContactSchema.index({ emailStatus: 1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.Contact) {
  delete mongoose.models.Contact;
}

const Contact: Model<IContact> = mongoose.model<IContact>('Contact', ContactSchema);

export default Contact;