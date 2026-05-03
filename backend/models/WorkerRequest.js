import mongoose from 'mongoose';

const workerRequestSchema = new mongoose.Schema({
  // The employer sending the request
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: true,
    index: true
  },
  // The employer's user account (for easy lookup)
  employerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // The worker receiving the request
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  // The worker's user account (for easy lookup)
  workerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Request status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    index: true
  },
  // Employer/company name for display in notifications
  employerName: {
    type: String,
    required: true
  },
  // Worker name for display 
  workerName: {
    type: String
  },
  // Worker phone used to find them
  workerPhone: {
    type: String,
    required: true
  },
  // Optional message from employer
  message: {
    type: String,
    maxlength: 500
  },
  // When the worker responded
  respondedAt: Date,
  // Notification read status
  employerNotificationRead: {
    type: Boolean,
    default: false
  },
  workerNotificationRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to prevent duplicate pending requests
workerRequestSchema.index(
  { employerId: 1, workerId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// Index for finding requests by worker user
workerRequestSchema.index({ workerUserId: 1, status: 1 });

export const WorkerRequest = mongoose.model('WorkerRequest', workerRequestSchema);
