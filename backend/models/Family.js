import mongoose from 'mongoose';

const familySchema = new mongoose.Schema({
  // Unique identifier - 12 digit ration card number
  ration_no: {
    type: Number,
    required: true,
    unique: true,
    min: 100000000000,
    max: 999999999999,
    validate: {
      validator: function(v) {
        return /^\d{12}$/.test(v.toString());
      },
      message: 'Ration number must be exactly 12 digits'
    }
  },

  // Family Demographics
  family_size: {
    type: Number,
    required: true,
    min: 1,
    max: 20
  },
  head_age: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  children_0_6: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  children_6_14: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  adults_16_59: {
    type: Number,
    required: true,
    min: 0,
    max: 15,
    default: 0
  },
  adult_males_16_59: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  adult_females_16_59: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  adult_other_16_59: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  elderly_60_plus: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  able_bodied_adults: {
    type: Number,
    required: true,
    min: 0,
    max: 15,
    default: 0
  },
  working_members: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  literate_adults_above_25: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },
  children_in_school: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 0
  },

  // Household Type Indicators
  is_female_headed: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  is_pvtg: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  is_minority: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  is_informal: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },

  // Education & Income
  education_code: {
    type: Number,
    required: true,
    min: 0,
    max: 7,
    default: 0
  },
  highest_earner_monthly: {
    type: Number,
    required: true,
    min: 0,
    max: 500000,
    default: 0
  },

  // Land & Agriculture
  total_land_acres: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },
  irrigated_land_acres: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },
  crop_seasons: {
    type: Number,
    required: true,
    min: 0,
    max: 3,
    default: 0
  },

  // Assets - Exclusion Criteria
  owns_two_wheeler: {
    type: Boolean,
    default: false
  },
  owns_four_wheeler: {
    type: Boolean,
    default: false
  },
  owns_tractor: {
    type: Boolean,
    default: false
  },
  owns_mechanized_equipment: {
    type: Boolean,
    default: false
  },
  owns_refrigerator: {
    type: Boolean,
    default: false
  },
  owns_landline: {
    type: Boolean,
    default: false
  },

  // Assets - General Indicators
  owns_tv: {
    type: Boolean,
    default: false
  },
  owns_mobile: {
    type: Boolean,
    default: false
  },

  // Financial Status
  has_bank_account: {
    type: Boolean,
    default: false
  },
  has_savings: {
    type: Boolean,
    default: false
  },
  has_loan: {
    type: Boolean,
    default: false
  },
  loan_source: {
    type: String,
    enum: ['none', 'bank', 'cooperative', 'moneylender', 'family', 'other'],
    default: 'none'
  },

  // Housing
  house_type: {
    type: String,
    required: true,
    enum: ['houseless', 'temporary_plastic', 'kucha', 'semi_pucca', 'pucca'],
    default: 'kucha'
  },
  num_rooms: {
    type: Number,
    required: true,
    min: 0,
    max: 10,
    default: 1
  },
  has_electricity: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  has_water_tap: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  has_toilet: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  is_houseless: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },

  // APL/BPL Classification Results (from AI model)
  classification: {
    type: String,
    enum: ['APL', 'BPL', 'pending'],
    default: 'pending'
  },
  classification_confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  classification_reason: {
    type: String,
    default: ''
  },
  
  // ML Model Results
  ml_classification: {
    type: String,
    enum: ['APL', 'BPL', null],
    default: null
  },
  ml_bpl_probability: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  ml_apl_probability: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // SECC Analysis Results
  secc_classification: {
    type: String,
    enum: ['APL', 'BPL', null],
    default: null
  },
  secc_reason: {
    type: String,
    default: ''
  },
  secc_has_exclusion: {
    type: Boolean,
    default: false
  },
  secc_has_inclusion: {
    type: Boolean,
    default: false
  },
  secc_deprivation_count: {
    type: Number,
    min: 0,
    default: 0
  },
  secc_exclusion_met: [{
    type: String
  }],
  secc_inclusion_met: [{
    type: String
  }],
  secc_deprivation_met: [{
    type: String
  }],
  
  // Recommendation
  recommendation_priority: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW', null],
    default: null
  },
  recommendation_message: {
    type: String,
    default: ''
  },
  eligible_schemes: [{
    type: String
  }],
  
  // Classification metadata
  classified_at: {
    type: Date,
    default: null
  },
  
  // Family update tracking
  requires_update: {
    type: Boolean,
    default: false
  },
  last_auto_update: {
    type: Date,
    default: null
  },
  
  // Policy screening results
  policy_overrides_applied: [{
    policyId: String,
    policyName: String,
    action: String,
    originalClassification: String,
    ignoredCriteria: [String]
  }],
  last_policy_screening: {
    type: Date,
    default: null
  },
  requires_manual_review: {
    type: Boolean,
    default: false
  },
  review_reason: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries (ration_no already has unique index from field definition)
familySchema.index({ family_size: 1, highest_earner_monthly: 1 });
familySchema.index({ is_female_headed: 1 });
familySchema.index({ is_pvtg: 1, is_minority: 1 });

// Virtual to get family members (users belonging to this family)
familySchema.virtual('members', {
  ref: 'User',
  localField: 'ration_no',
  foreignField: 'ration_no'
});

// Method to check exclusion criteria
familySchema.methods.hasExclusionCriteria = function() {
  return (
    this.owns_two_wheeler ||
    this.owns_four_wheeler ||
    this.owns_tractor ||
    this.owns_mechanized_equipment ||
    this.owns_refrigerator ||
    this.owns_landline
  );
};

// Method to calculate economic score (for welfare eligibility)
familySchema.methods.calculateEconomicScore = function() {
  let score = 0;
  
  // Lower income increases score
  if (this.highest_earner_monthly < 5000) score += 10;
  else if (this.highest_earner_monthly < 10000) score += 7;
  else if (this.highest_earner_monthly < 15000) score += 4;
  
  // Special categories
  if (this.is_female_headed) score += 5;
  if (this.is_pvtg) score += 8;
  if (this.is_minority) score += 3;
  if (this.is_informal) score += 4;
  
  // Housing conditions
  if (this.is_houseless) score += 10;
  else if (this.house_type === 'temporary_plastic') score += 8;
  else if (this.house_type === 'kucha') score += 6;
  else if (this.house_type === 'semi_pucca') score += 3;
  
  // Basic amenities
  if (!this.has_electricity) score += 3;
  if (!this.has_water_tap) score += 3;
  if (!this.has_toilet) score += 4;
  
  // Dependency ratio
  const dependents = this.children_0_6 + this.children_6_14 + this.elderly_60_plus;
  const earners = this.working_members || 1;
  const dependencyRatio = dependents / earners;
  if (dependencyRatio > 3) score += 5;
  else if (dependencyRatio > 2) score += 3;
  
  return score;
};

// Static method to find eligible families for welfare
familySchema.statics.findEligibleForWelfare = async function(minScore = 20) {
  const families = await this.find({
    owns_two_wheeler: false,
    owns_four_wheeler: false,
    owns_tractor: false,
    owns_mechanized_equipment: false,
    owns_refrigerator: false,
    owns_landline: false
  });
  
  return families.filter(family => family.calculateEconomicScore() >= minScore);
};

export const Family = mongoose.model('Family', familySchema);
