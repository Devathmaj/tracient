import mongoose from 'mongoose';
import { PAYMENT_STATUS, TRANSACTION_TYPES } from '../config/constants.js';

const wageRecordSchema = new mongoose.Schema({
  // References
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: false, // Not required for self-declared income
    index: true
  },
  workerIdHash: {
    type: String,
    required: true,
    index: true
  },
  employerIdHash: {
    type: String,
    index: true
  },
  
  // Transaction Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  transactionType: {
    type: String,
    enum: Object.values(TRANSACTION_TYPES),
    default: TRANSACTION_TYPES.WAGE
  },
  
  // Description
  description: String,
  workPeriod: {
    startDate: Date,
    endDate: Date,
    hoursWorked: Number,
    daysWorked: Number
  },
  
  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['upi', 'bank_transfer', 'cash', 'cheque'],
    required: true
  },
  referenceNumber: {
    type: String,
    unique: true,
    required: true
  },
  upiTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UPITransaction'
  },
  
  // Status
  status: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING
  },
  statusHistory: [{
    status: String,
    timestamp: Date,
    note: String,
    updatedBy: mongoose.Schema.Types.ObjectId
  }],
  
  // Verification
  verifiedOnChain: {
    type: Boolean,
    default: false
  },
  blockchainTxId: String,
  blockNumber: Number,
  
  // Blockchain sync status (for future integration)
  syncedToBlockchain: {
    type: Boolean,
    default: false
  },
  blockchainSyncError: String,
  
  // Metadata
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  failedAt: Date,
  failureReason: String,
  
  // Additional payment metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Source
  source: {
    type: String,
    enum: ['manual', 'qr_scan', 'bulk_upload', 'api', 'employer', 'government', 'self_declared'],
    default: 'manual'
  },
  
  // Income source name (e.g., employer name, "Private Work", etc.)
  incomeSource: {
    type: String,
    default: ''
  },
  
  // Whether the income is verified (employer payments = verified, self-declared = unverified)
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Location (optional)
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes
wageRecordSchema.index({ workerId: 1, createdAt: -1 });
wageRecordSchema.index({ employerId: 1, createdAt: -1 });
wageRecordSchema.index({ status: 1, createdAt: -1 });
wageRecordSchema.index({ workerIdHash: 1, createdAt: -1 });

// Methods
wageRecordSchema.methods.markCompleted = function(blockchainTxId) {
  this.status = PAYMENT_STATUS.COMPLETED;
  this.completedAt = new Date();
  this.statusHistory.push({
    status: PAYMENT_STATUS.COMPLETED,
    timestamp: new Date(),
    note: 'Payment completed successfully'
  });
  
  if (blockchainTxId) {
    this.verifiedOnChain = true;
    this.blockchainTxId = blockchainTxId;
  }
  
  return this.save();
};

wageRecordSchema.methods.markFailed = function(reason) {
  this.status = PAYMENT_STATUS.FAILED;
  this.failedAt = new Date();
  this.failureReason = reason;
  this.statusHistory.push({
    status: PAYMENT_STATUS.FAILED,
    timestamp: new Date(),
    note: reason
  });
  
  return this.save();
};

// Statics
wageRecordSchema.statics.getWorkerTransactions = function(workerId, options = {}) {
  const query = { workerId };
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('employerId', 'companyName');
};

wageRecordSchema.statics.getEmployerTransactions = function(employerId, options = {}) {
  const query = { employerId };
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('workerId', 'name idHash');
};

wageRecordSchema.statics.calculateWorkerIncome = async function(workerId, months = 12) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  
  const result = await this.aggregate([
    {
      $match: {
        workerId: new mongoose.Types.ObjectId(workerId),
        status: PAYMENT_STATUS.COMPLETED,
        createdAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: null,
        totalIncome: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
        avgTransaction: { $avg: '$amount' }
      }
    }
  ]);
  
  return result[0] || { totalIncome: 0, transactionCount: 0, avgTransaction: 0 };
};

export const WageRecord = mongoose.model('WageRecord', wageRecordSchema);
