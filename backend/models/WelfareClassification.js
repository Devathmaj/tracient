import mongoose from 'mongoose';

/**
 * Welfare Classification Model
 * Stores APL/BPL classification history for workers
 * Allows up to 6 classification attempts per year
 */
const welfareClassificationSchema = new mongoose.Schema({
  // Reference to Worker
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  
  // Reference to Family (if exists)
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family'
  },
  
  // Classification Year
  year: {
    type: Number,
    required: true,
    index: true
  },
  
  // Attempt number in this year (max 6 per year)
  attemptNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  
  // Annual Income Data
  annualIncome: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Income Breakdown by Source
  incomeBreakdown: [{
    source: String,
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employer'
    },
    amount: Number,
    percentage: Number,
    verified: Boolean,
    transactionCount: Number
  }],
  
  // Monthly Income Data
  monthlyIncome: [{
    month: Number, // 1-12
    monthName: String,
    amount: Number,
    verified: Number,
    unverified: Number
  }],
  
  // Classification Result
  classification: {
    type: String,
    enum: ['APL', 'BPL'],
    required: true
  },
  
  // AI Model Results
  mlClassification: {
    type: String,
    enum: ['APL', 'BPL'],
    default: null
  },
  mlBplProbability: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  mlAplProbability: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  mlConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // SECC Analysis
  seccClassification: {
    type: String,
    enum: ['APL', 'BPL'],
    default: null
  },
  seccReason: String,
  seccDeprivationCount: Number,
  seccHasExclusion: Boolean,
  seccHasInclusion: Boolean,
  seccExclusionMet: [String],
  seccInclusionMet: [String],
  seccDeprivationMet: [String],
  
  // Final Decision Reason
  classificationReason: {
    type: String,
    required: true
  },
  
  // Verification Statistics
  verificationStats: {
    totalTransactions: Number,
    verifiedTransactions: Number,
    unverifiedTransactions: Number,
    verifiedAmount: Number,
    unverifiedAmount: Number,
    verificationPercentage: Number
  },
  
  // Threshold
  bplThreshold: {
    type: Number,
    required: true
  },
  
  // Eligible Schemes
  eligibleSchemes: [{
    schemeId: String,
    schemeName: String,
    description: String,
    benefits: String
  }],
  
  // Recommendation
  recommendationPriority: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    default: 'MEDIUM'
  },
  recommendationMessage: String,
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Metadata
  classifiedAt: {
    type: Date,
    default: Date.now
  },
  classifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes
welfareClassificationSchema.index({ workerId: 1, year: 1, attemptNumber: 1 }, { unique: true });
welfareClassificationSchema.index({ workerId: 1, classifiedAt: -1 });
welfareClassificationSchema.index({ year: 1, classification: 1 });

// Static method to get attempts count for a year
welfareClassificationSchema.statics.getAttemptsCount = async function(workerId, year) {
  return await this.countDocuments({ workerId, year });
};

// Static method to check if can attempt
welfareClassificationSchema.statics.canAttempt = async function(workerId, year) {
  const count = await this.getAttemptsCount(workerId, year);
  return count < 6;
};

// Static method to get latest classification
welfareClassificationSchema.statics.getLatestClassification = async function(workerId) {
  return await this.findOne({ workerId, isActive: true })
    .sort({ classifiedAt: -1 })
    .populate('incomeBreakdown.employerId', 'companyName');
};

// Static method to get classification history
welfareClassificationSchema.statics.getHistory = async function(workerId, year = null) {
  const query = { workerId };
  if (year) query.year = year;
  
  return await this.find(query)
    .sort({ classifiedAt: -1 })
    .populate('incomeBreakdown.employerId', 'companyName');
};

export const WelfareClassification = mongoose.model('WelfareClassification', welfareClassificationSchema);
