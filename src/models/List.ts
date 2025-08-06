import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IList extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  enableAiPersonalization: boolean;
  personalizationPrompt?: string;
  contactCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ListSchema = new Schema<IList>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    enableAiPersonalization: {
      type: Boolean,
      default: false,
    },
    personalizationPrompt: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    contactCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for user-specific list queries
ListSchema.index({ userId: 1, isActive: 1 });
// Create unique index for active lists only (allows reusing names after deletion)
ListSchema.index({ userId: 1, name: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Force remove the cached model to ensure schema updates are applied
if (mongoose.models.List) {
  delete mongoose.models.List;
}

// Drop existing indexes and recreate them to handle potential conflicts
ListSchema.pre('save', async function() {
  if (this.isNew) {
    try {
      // Try to drop and recreate indexes if there are conflicts
      await this.collection.dropIndex({ userId: 1, name: 1 }).catch(() => {});
    } catch (error) {
      // Ignore index errors during development
      console.log('Index handling:', error);
    }
  }
});

const List: Model<IList> = mongoose.model<IList>('List', ListSchema);

export default List;