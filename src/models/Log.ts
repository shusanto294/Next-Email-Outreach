import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ILog extends Document {
  userId: mongoose.Types.ObjectId;
  source: 'send' | 'receive';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  metadata?: {
    emailAccount?: string;
    campaign?: string;
    contact?: string;
    emailsSent?: number;
    emailsFetched?: number;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const LogSchema = new Schema<ILog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['send', 'receive'],
      required: true,
    },
    level: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
LogSchema.index({ userId: 1, createdAt: -1 });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.Log) {
  delete mongoose.models.Log;
}

const Log: Model<ILog> = mongoose.model<ILog>('Log', LogSchema);

export default Log;
