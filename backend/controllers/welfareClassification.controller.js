/**
 * Welfare Classification Controller
 * Handles APL/BPL classification with AI/ML integration
 */
import { Worker } from '../models/Worker.js';
import { WageRecord } from '../models/WageRecord.js';
import { WelfareClassification } from '../models/WelfareClassification.js';
import { Family } from '../models/Family.js';
import { classifyHousehold } from '../services/ai.service.js';
import { successResponse, errorResponse, notFoundResponse } from '../utils/response.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * Get current welfare classification status
 */
export const getCurrentClassification = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    // Get latest classification
    const latestClassification = await WelfareClassification.getLatestClassification(worker._id);
    
    if (!latestClassification) {
      return successResponse(res, {
        hasClassification: false,
        message: 'No classification found. Please attempt classification test.'
      });
    }

    return successResponse(res, {
      hasClassification: true,
      classification: latestClassification
    });
  } catch (error) {
    logger.error('Get current classification error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get classification history
 */
export const getClassificationHistory = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    const { year } = req.query;
    const history = await WelfareClassification.getHistory(worker._id, year ? parseInt(year) : null);
    
    // Get available years
    const years = await WelfareClassification.distinct('year', { workerId: worker._id });
    
    return successResponse(res, {
      history,
      availableYears: years.sort((a, b) => b - a),
      currentYear: new Date().getFullYear()
    });
  } catch (error) {
    logger.error('Get classification history error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Attempt new classification
 */
export const attemptClassification = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    const currentYear = new Date().getFullYear();
    
    // Check if can attempt
    const canAttempt = await WelfareClassification.canAttempt(worker._id, currentYear);
    
    if (!canAttempt) {
      return errorResponse(res, 'Maximum 6 attempts per year reached', 400);
    }

    // Get attempt number
    const attemptCount = await WelfareClassification.getAttemptsCount(worker._id, currentYear);
    const attemptNumber = attemptCount + 1;

    // Calculate annual income from last 12 months
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const wageRecords = await WageRecord.find({
      workerId: worker._id,
      status: 'completed',
      createdAt: { $gte: oneYearAgo }
    }).populate('employerId', 'companyName').sort({ createdAt: -1 });

    const annualIncome = wageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // Income breakdown by source
    const incomeBreakdownMap = {};
    wageRecords.forEach(w => {
      const source = w.employerId?.companyName || w.incomeSource || 'Other';
      if (!incomeBreakdownMap[source]) {
        incomeBreakdownMap[source] = {
          source,
          employerId: w.employerId?._id,
          amount: 0,
          verified: 0,
          unverified: 0,
          transactionCount: 0
        };
      }
      incomeBreakdownMap[source].amount += w.amount;
      incomeBreakdownMap[source].transactionCount++;
      
      // Employer payments are verified, self-declared are not
      const isVerified = w.isVerified || (w.employerId && w.source === 'employer');
      if (isVerified) {
        incomeBreakdownMap[source].verified += w.amount;
      } else {
        incomeBreakdownMap[source].unverified += w.amount;
      }
    });
    
    const incomeBreakdown = Object.values(incomeBreakdownMap).map(item => ({
      ...item,
      percentage: annualIncome > 0 ? Math.round((item.amount / annualIncome) * 100) : 0,
      verified: item.verified > 0
    })).sort((a, b) => b.amount - a.amount);

    // Monthly income data
    const monthlyIncome = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(currentYear, new Date().getMonth() - i, 1);
      const monthEnd = new Date(currentYear, new Date().getMonth() - i + 1, 0, 23, 59, 59);
      const month = monthDate.getMonth() + 1;
      const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
      
      const monthRecords = wageRecords.filter(w => {
        const d = new Date(w.createdAt);
        return d >= monthDate && d <= monthEnd;
      });
      
      const monthTotal = monthRecords.reduce((sum, w) => sum + w.amount, 0);
      const verified = monthRecords.filter(w => w.isVerified || (w.employerId && w.source === 'employer')).reduce((sum, w) => sum + w.amount, 0);
      const unverified = monthTotal - verified;
      
      monthlyIncome.push({
        month,
        monthName,
        amount: monthTotal,
        verified,
        unverified
      });
    }

    // BPL threshold
    const threshold = parseInt(process.env.BPL_THRESHOLD) || 120000;
    
    // Get family data for AI classification
    const family = await Family.findOne({ workerId: worker._id });
    
    // Call AI model for classification
    let aiClassificationResult = null;
    let mlClassification = null;
    let mlBplProbability = 0;
    let mlAplProbability = 0;
    let mlConfidence = 0;
    let seccClassification = null;
    let seccReason = '';
    let seccDeprivationCount = 0;
    let seccHasExclusion = false;
    let seccHasInclusion = false;
    let seccExclusionMet = [];
    let seccInclusionMet = [];
    let seccDeprivationMet = [];
    let classification = annualIncome <= threshold ? 'BPL' : 'APL';
    
    // If family data exists, use AI model for classification
    if (family) {
      try {
        const surveyData = {
          ...family.toObject(),
          annual_income: annualIncome,
          highest_earner_monthly: Math.round(annualIncome / 12)
        };
        
        logger.info('Calling AI model for classification...');
        aiClassificationResult = await classifyHousehold(surveyData);
        
        if (aiClassificationResult && aiClassificationResult.success) {
          classification = aiClassificationResult.classification;
          
          if (aiClassificationResult.ml_prediction) {
            mlClassification = aiClassificationResult.ml_prediction.classification;
            mlConfidence = aiClassificationResult.ml_prediction.confidence || 0;
            mlBplProbability = aiClassificationResult.ml_prediction.bpl_probability || 0;
            mlAplProbability = aiClassificationResult.ml_prediction.apl_probability || 0;
          }
          
          if (aiClassificationResult.secc_analysis) {
            seccClassification = aiClassificationResult.secc_analysis.secc_classification;
            seccReason = aiClassificationResult.secc_analysis.secc_reason;
            seccHasExclusion = aiClassificationResult.secc_analysis.has_exclusion || false;
            seccHasInclusion = aiClassificationResult.secc_analysis.has_inclusion || false;
            seccDeprivationCount = aiClassificationResult.secc_analysis.deprivation_count || 0;
            seccExclusionMet = aiClassificationResult.secc_analysis.exclusion_met || [];
            seccInclusionMet = aiClassificationResult.secc_analysis.inclusion_met || [];
            seccDeprivationMet = aiClassificationResult.secc_analysis.deprivation_met || [];
          }
          
          logger.info(`AI classification result: ${classification} (${mlConfidence}% confidence)`);
        }
      } catch (aiError) {
        logger.warn('AI model classification failed, using income-based fallback:', aiError.message);
        // Keep default income-based classification
        mlClassification = classification;
        mlBplProbability = classification === 'BPL' ? 75 : 25;
        mlAplProbability = 100 - mlBplProbability;
        mlConfidence = Math.max(mlBplProbability, mlAplProbability);
      }
    } else {
      // No family data, use income-based classification
      mlClassification = classification;
      mlBplProbability = classification === 'BPL' ? 75 : 25;
      mlAplProbability = 100 - mlBplProbability;
      mlConfidence = Math.max(mlBplProbability, mlAplProbability);
    }
    
    // Classification reason
    let classificationReason = `Annual income of ₹${annualIncome.toLocaleString('en-IN')} is ${classification === 'BPL' ? 'below' : 'above'} the threshold of ₹${threshold.toLocaleString('en-IN')}.`;
    if (family && seccClassification) {
      classificationReason += ` SECC analysis: ${seccReason}.`;
    }
    classificationReason += ` ML confidence: ${mlConfidence}%.`;
    
    // Verification statistics
    const verifiedTransactions = wageRecords.filter(w => w.isVerified || (w.employerId && w.source === 'employer')).length;
    const unverifiedTransactions = wageRecords.length - verifiedTransactions;
    const verifiedAmount = wageRecords.filter(w => w.isVerified || (w.employerId && w.source === 'employer')).reduce((sum, w) => sum + w.amount, 0);
    const unverifiedAmount = annualIncome - verifiedAmount;
    
    const verificationStats = {
      totalTransactions: wageRecords.length,
      verifiedTransactions,
      unverifiedTransactions,
      verifiedAmount,
      unverifiedAmount,
      verificationPercentage: wageRecords.length > 0 ? Math.round((verifiedTransactions / wageRecords.length) * 100) : 0
    };
    
    // Eligible schemes
    const eligibleSchemes = classification === 'BPL' ? [
      {
        schemeId: 'pds',
        schemeName: 'Public Distribution System (PDS)',
        description: 'Subsidized food grains distribution',
        benefits: 'Rice at ₹3/kg, Wheat at ₹2/kg'
      },
      {
        schemeId: 'pmay',
        schemeName: 'Pradhan Mantri Awas Yojana',
        description: 'Housing scheme for economically weaker sections',
        benefits: 'Up to ₹2.67 lakhs subsidy'
      },
      {
        schemeId: 'ayushman',
        schemeName: 'Ayushman Bharat',
        description: 'Health insurance scheme',
        benefits: 'Up to ₹5 lakhs coverage per family'
      }
    ] : [];
    
    // Recommendation
    const recommendationPriority = classification === 'BPL' ? 'HIGH' : 'LOW';
    const recommendationMessage = classification === 'BPL' ?
      'You are eligible for various government welfare schemes. Please apply for benefits.' :
      'You are currently classified as APL. Continue monitoring your income status.';
    
    // Create classification record
    const classificationRecord = await WelfareClassification.create({
      workerId: worker._id,
      familyId: family?._id,
      year: currentYear,
      attemptNumber,
      annualIncome,
      incomeBreakdown,
      monthlyIncome,
      classification,
      mlClassification,
      mlBplProbability,
      mlAplProbability,
      mlConfidence,
      seccClassification,
      seccReason,
      seccDeprivationCount,
      seccHasExclusion,
      seccHasInclusion,
      seccExclusionMet,
      seccInclusionMet,
      seccDeprivationMet,
      classificationReason,
      verificationStats,
      bplThreshold: threshold,
      eligibleSchemes,
      recommendationPriority,
      recommendationMessage,
      isActive: true,
      classifiedAt: new Date(),
      classifiedBy: req.user.id
    });
    
    // Update worker's income category
    worker.incomeCategory = classification === 'BPL' ? 'BPL' : 'APL';
    worker.annualIncome = annualIncome;
    worker.lastClassificationDate = new Date();
    await worker.save();
    
    // Update family classification if exists
    if (family) {
      family.classification = classification;
      family.classification_confidence = mlConfidence;
      family.classification_reason = classificationReason;
      family.ml_classification = mlClassification;
      family.ml_bpl_probability = mlBplProbability;
      family.ml_apl_probability = mlAplProbability;
      family.secc_classification = seccClassification;
      family.secc_reason = seccReason;
      family.classified_at = new Date();
      await family.save();
    }
    
    return successResponse(res, {
      classification: classificationRecord,
      message: `Classification completed successfully. You are classified as ${classification}.`,
      attemptsRemaining: 6 - attemptNumber
    });
  } catch (error) {
    logger.error('Attempt classification error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get attempts remaining for current year
 */
export const getAttemptsRemaining = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    const currentYear = new Date().getFullYear();
    const attemptCount = await WelfareClassification.getAttemptsCount(worker._id, currentYear);
    const attemptsRemaining = 6 - attemptCount;
    const canAttempt = attemptsRemaining > 0;
    
    return successResponse(res, {
      year: currentYear,
      attemptCount,
      attemptsRemaining,
      maxAttempts: 6,
      canAttempt
    });
  } catch (error) {
    logger.error('Get attempts remaining error:', error);
    return errorResponse(res, error.message, 500);
  }
};

export default {
  getCurrentClassification,
  getClassificationHistory,
  attemptClassification,
  getAttemptsRemaining
};
