/**
 * AI Service for Anomaly Detection and BPL Classification
 * Interfaces with Python AI models
 */
import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger.util.js';
import { calculateBPLStatus, calculateIncomeTrend } from '../utils/bpl.util.js';
import { AI_CONFIG } from '../config/constants.js';
import { screenClassification } from './policyScreening.service.js';

const AI_MODEL_PATH = process.env.AI_MODEL_PATH || path.resolve('..', 'ai-model');
const AI_API_URL = AI_CONFIG.API_URL;

/**
 * Classify household as APL/BPL using the AI model API
 * Then apply policy screening to override if necessary
 * @param {Object} surveyData - Family survey data
 * @returns {Object} Classification result (potentially modified by policies)
 */
export const classifyHousehold = async (surveyData) => {
  try {
    logger.info('Calling APL/BPL classification API...');
    
    let result;
    
    // Try the Python API first
    try {
      const response = await fetch(`${AI_API_URL}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(surveyData)
      });
      
      if (response.ok) {
        result = await response.json();
        logger.info(`AI Classification result: ${result.classification} (${result.ml_prediction?.confidence || 0}% confidence)`);
      } else {
        // If API fails, fall back to rule-based SECC analysis
        logger.warn('AI API unavailable, using rule-based SECC analysis');
        result = performSECCAnalysis(surveyData);
      }
    } catch (apiError) {
      logger.warn('AI API error, falling back to SECC analysis:', apiError.message);
      result = performSECCAnalysis(surveyData);
    }
    
    // Apply policy screening to the classification result
    // This will check active policies and potentially override the classification
    try {
      const screenedResult = await screenClassification(result, surveyData);
      
      if (screenedResult.policy_overrides_applied && screenedResult.policy_overrides_applied.length > 0) {
        logger.info(`Policy screening applied ${screenedResult.policy_overrides_applied.length} override(s). Final classification: ${screenedResult.classification}`);
      }
      
      return screenedResult;
    } catch (screeningError) {
      logger.error('Policy screening error, returning unscreened result:', screeningError.message);
      return {
        ...result,
        policy_screened: false,
        policy_screening_error: screeningError.message
      };
    }
    
  } catch (error) {
    logger.error('Classification error:', error.message);
    // Return a safe fallback
    return {
      success: false,
      classification: 'pending',
      reason: 'Classification failed: ' + error.message,
      error: error.message
    };
  }
};

/**
 * Rule-based SECC 2011 analysis (fallback when AI API is unavailable)
 */
const performSECCAnalysis = (data) => {
  const toInt = (val) => {
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val || 0;
  };
  
  // Check exclusion criteria
  const exclusionCriteria = {
    'Owns motorized 2-wheeler': toInt(data.owns_two_wheeler) === 1,
    'Owns 3/4 wheeler': toInt(data.owns_four_wheeler) === 1,
    'Owns tractor/harvester': toInt(data.owns_tractor) === 1,
    'Owns mechanized equipment': toInt(data.owns_mechanized_equipment) === 1,
    'KCC limit >= Rs.50,000': data.kcc_limit >= 50000,
    'Owns refrigerator': toInt(data.owns_refrigerator) === 1,
    'Owns landline phone': toInt(data.owns_landline) === 1,
    'Pucca house with 3+ rooms': data.house_type === 'pucca' && data.num_rooms >= 3,
    'Owns 2.5+ acres land': data.total_land_acres >= 2.5,
  };
  
  // Check inclusion criteria
  const inclusionCriteria = {
    'Houseless': toInt(data.is_houseless) === 1,
    'Primitive Tribal Group': toInt(data.is_pvtg) === 1,
  };
  
  // Check deprivation indicators
  const deprivationIndicators = {
    'One room kucha house': ['kucha', 'houseless', 'temporary_plastic'].includes(data.house_type) && data.num_rooms <= 1,
    'No adult member (16-59)': data.adults_16_59 === 0,
    'Female-headed, no adult male': toInt(data.is_female_headed) === 1 && data.adult_males_16_59 === 0,
    'No literate adult above 25': data.literate_adults_above_25 === 0,
    'Low monthly income': data.highest_earner_monthly < 5000,
    'No basic amenities': !toInt(data.has_electricity) && !toInt(data.has_water_tap) && !toInt(data.has_toilet),
  };
  
  const hasExclusion = Object.values(exclusionCriteria).some(v => v);
  const hasInclusion = Object.values(inclusionCriteria).some(v => v);
  const deprivationCount = Object.values(deprivationIndicators).filter(v => v).length;
  
  let classification, reason;
  if (hasInclusion) {
    classification = 'BPL';
    reason = 'Automatic inclusion criteria met';
  } else if (hasExclusion) {
    classification = 'APL';
    reason = 'Automatic exclusion criteria met';
  } else if (deprivationCount >= 1) {
    classification = 'BPL';
    reason = `${deprivationCount} deprivation indicator(s)`;
  } else {
    classification = 'APL';
    reason = 'No deprivation indicators';
  }
  
  // Eligible schemes for BPL
  const eligibleSchemes = classification === 'BPL' ? [
    'Public Distribution System (PDS)',
    'MGNREGA',
    'PM Awas Yojana',
    'Ayushman Bharat',
    'National Food Security Act benefits'
  ] : [];
  
  return {
    success: true,
    classification,
    reason,
    ml_prediction: null,
    secc_analysis: {
      secc_classification: classification,
      secc_reason: reason,
      has_exclusion: hasExclusion,
      has_inclusion: hasInclusion,
      deprivation_count: deprivationCount,
      exclusion_met: Object.entries(exclusionCriteria).filter(([, v]) => v).map(([k]) => k),
      inclusion_met: Object.entries(inclusionCriteria).filter(([, v]) => v).map(([k]) => k),
      deprivation_met: Object.entries(deprivationIndicators).filter(([, v]) => v).map(([k]) => k),
    },
    recommendation: {
      priority: classification === 'BPL' ? (hasInclusion || deprivationCount >= 3 ? 'HIGH' : 'MEDIUM') : 'LOW',
      message: classification === 'BPL' 
        ? 'Eligible for BPL benefits. Enrollment in welfare programs recommended.'
        : 'Above poverty line. Not eligible for BPL benefits.',
      eligible_schemes: eligibleSchemes,
      deprivation_indicators: Object.entries(deprivationIndicators).filter(([, v]) => v).map(([k]) => k),
      exclusion_indicators: Object.entries(exclusionCriteria).filter(([, v]) => v).map(([k]) => k),
    }
  };
};

/**
 * Detect anomalies in transaction data using AI API
 * @param {Object} transactionData - Worker transaction/income data
 * @returns {Object} Anomaly detection result
 */
export const detectAnomaly = async (transactionData) => {
  try {
    logger.info('Calling Anomaly Detection API...');
    
    // Prepare data for AI API
    const requestBody = {
      worker_data: transactionData.worker_data || {
        sector: transactionData.sector || 'other',
        is_formal: transactionData.is_formal || 0,
        income_tier: transactionData.income_tier || 'low',
        account_age_months: transactionData.account_age_months || 12
      },
      pattern_data: transactionData.pattern_data || {
        avg_tx_per_month: transactionData.avg_tx_per_month || transactionData.transactionCount || 5,
        weekend_pct: transactionData.weekend_pct || 0.1,
        night_hours_pct: transactionData.night_hours_pct || 0.05,
        round_amount_pct: transactionData.round_amount_pct || 0.15,
        near_50k_pct: transactionData.near_50k_pct || 0.05,
        num_unique_sources: transactionData.num_unique_sources || 1,
        source_concentration: transactionData.source_concentration || 0.9,
        unverified_rate: transactionData.unverified_rate || 0.1,
        velocity_change: transactionData.velocity_change || 1.0,
        burst_ratio: transactionData.burst_ratio || 1.0,
        cash_deposit_rate: transactionData.cash_deposit_rate || 0.1
      },
      income_data: transactionData.income_data || {
        income_cv: transactionData.income_cv || 0.2,
        max_mom_increase: transactionData.max_mom_increase || 0.3,
        max_deviation_from_mean: transactionData.max_deviation_from_mean || 0.5,
        monthly_incomes: transactionData.monthly_incomes || []
      }
    };
    
    // Calculate income_cv from historicalAvg if available
    if (transactionData.amount && transactionData.historicalAvg) {
      const deviation = Math.abs(transactionData.amount - transactionData.historicalAvg);
      requestBody.income_data.max_deviation_from_mean = deviation / transactionData.historicalAvg;
      requestBody.income_data.max_mom_increase = transactionData.amount / transactionData.historicalAvg;
    }
    
    // Try the AI API first
    const response = await fetch(`${AI_API_URL}/detect-anomaly`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.info(`Anomaly detection result: ${result.is_anomaly ? 'ANOMALY DETECTED' : 'Normal'} (score: ${result.anomaly_score})`);
      return {
        success: true,
        isAnomaly: result.is_anomaly,
        anomalyScore: result.anomaly_score,
        confidence: result.confidence,
        severity: result.severity,
        anomalyTypes: result.anomaly_types,
        anomalyDescriptions: result.anomaly_descriptions,
        details: {
          mlResult: result.ml_result,
          detectionMethod: result.detection_method
        }
      };
    }
    
    // If API fails, fall back to rule-based detection
    logger.warn('AI API unavailable, using rule-based anomaly detection');
    const ruleBasedResult = ruleBasedAnomalyDetection(transactionData);
    return {
      success: true,
      isAnomaly: ruleBasedResult.isAnomaly,
      confidence: ruleBasedResult.confidence,
      anomalyScore: ruleBasedResult.confidence,
      severity: ruleBasedResult.isAnomaly ? 'medium' : 'low',
      anomalyTypes: ruleBasedResult.type ? [ruleBasedResult.type] : [],
      details: { ruleBased: ruleBasedResult },
      note: 'AI model unavailable, using rule-based detection'
    };
    
  } catch (error) {
    logger.warn('AI API error, falling back to rule-based detection:', error.message);
    const ruleBasedResult = ruleBasedAnomalyDetection(transactionData);
    return {
      success: true,
      isAnomaly: ruleBasedResult.isAnomaly,
      confidence: ruleBasedResult.confidence,
      anomalyScore: ruleBasedResult.confidence,
      severity: ruleBasedResult.isAnomaly ? 'medium' : 'low',
      anomalyTypes: ruleBasedResult.type ? [ruleBasedResult.type] : [],
      details: { ruleBased: ruleBasedResult },
      note: 'AI model unavailable, using rule-based detection'
    };
  }
};

/**
 * Batch detect anomalies for multiple workers
 * @param {Array} workers - Array of worker data objects
 * @returns {Object} Batch anomaly detection results
 */
export const batchDetectAnomalies = async (workers) => {
  try {
    logger.info(`Calling Batch Anomaly Detection API for ${workers.length} workers...`);
    
    const response = await fetch(`${AI_API_URL}/batch-detect-anomaly`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ workers })
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.info(`Batch anomaly scan complete: ${result.anomalies_found}/${result.total_scanned} anomalies found`);
      return {
        success: true,
        totalScanned: result.total_scanned,
        anomaliesFound: result.anomalies_found,
        results: result.results,
        detectionMethod: result.detection_method
      };
    }
    
    // Fallback: Process individually with rule-based
    logger.warn('Batch API unavailable, processing individually');
    const results = workers.map(worker => {
      const ruleResult = ruleBasedAnomalyDetection(worker);
      return {
        worker_id: worker.worker_id || 'unknown',
        is_anomaly: ruleResult.isAnomaly,
        anomaly_score: ruleResult.confidence,
        severity: ruleResult.isAnomaly ? 'medium' : 'low',
        anomaly_types: ruleResult.type ? [ruleResult.type] : []
      };
    });
    
    return {
      success: true,
      totalScanned: workers.length,
      anomaliesFound: results.filter(r => r.is_anomaly).length,
      results,
      detectionMethod: 'rules_only',
      note: 'API unavailable, used rule-based detection'
    };
    
  } catch (error) {
    logger.error('Batch anomaly detection failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Rule-based anomaly detection
 * Works with data from government controller's runAnomalyScan
 */
export const ruleBasedAnomalyDetection = (data) => {
  // Handle both old format and new format from runAnomalyScan
  const patternData = data.pattern_data || {};
  const incomeData = data.income_data || {};
  
  let isAnomaly = false;
  let confidence = 0;
  let type = null;
  const reasons = [];
  
  // Check for income spike using income_cv (coefficient of variation)
  const incomeCv = incomeData.income_cv || 0;
  if (incomeCv > 0.8) {
    isAnomaly = true;
    confidence += 30;
    type = 'income_spike';
    reasons.push(`High income variability: CV = ${(incomeCv * 100).toFixed(1)}%`);
  }
  
  // Check for large month-over-month increase
  const maxMomIncrease = incomeData.max_mom_increase || 0;
  if (maxMomIncrease > 3) { // 300% increase
    isAnomaly = true;
    confidence += 40;
    type = type || 'income_spike';
    reasons.push(`Large income spike: ${(maxMomIncrease * 100).toFixed(0)}% increase`);
  }
  
  // Check for max deviation from mean
  const maxDeviation = incomeData.max_deviation_from_mean || 0;
  if (maxDeviation > 3) { // 3x average
    isAnomaly = true;
    confidence += 35;
    type = type || 'unusual_amount';
    reasons.push(`Transaction ${(maxDeviation * 100).toFixed(0)}% above average`);
  }
  
  // Check for high unverified transaction rate
  const unverifiedRate = patternData.unverified_rate || 0;
  if (unverifiedRate > 0.5) {
    confidence += 15;
    reasons.push(`High unverified rate: ${(unverifiedRate * 100).toFixed(0)}%`);
  }
  
  // Check for weekend/night transaction patterns
  const weekendPct = patternData.weekend_pct || 0;
  const nightHoursPct = patternData.night_hours_pct || 0;
  if (weekendPct > 0.5 || nightHoursPct > 0.3) {
    confidence += 10;
    reasons.push('Unusual timing patterns');
  }
  
  // Check for high burst ratio (max transaction vs average)
  const burstRatio = patternData.burst_ratio || 1;
  if (burstRatio > 5) { // One transaction 5x the average
    isAnomaly = true;
    confidence += 25;
    type = type || 'unusual_amount';
    reasons.push(`Burst transaction: ${burstRatio.toFixed(1)}x average`);
  }
  
  // Legacy support for old format
  if (data.amount && data.historicalAvg) {
    if (data.amount > data.historicalAvg * 3) {
      isAnomaly = true;
      confidence += 40;
      type = 'income_spike';
      reasons.push(`Amount ${data.amount} is ${(data.amount / data.historicalAvg * 100).toFixed(0)}% of average`);
    }
  }
  
  if (data.transactionCount24h > 50) {
    isAnomaly = true;
    confidence += 30;
    type = type || 'high_frequency';
    reasons.push(`${data.transactionCount24h} transactions in 24 hours`);
  }
  
  return {
    isAnomaly,
    confidence: Math.min(confidence, 100),
    type,
    reasons
  };
};

/**
 * Classify household as BPL/APL
 */
export const classifyBPL = async (wageRecords) => {
  try {
    // Calculate using built-in BPL utility
    const bplResult = calculateBPLStatus(wageRecords);
    const trendResult = calculateIncomeTrend(wageRecords);
    
    // Try Python AI model for enhanced classification
    const aiResult = await runPythonModel('classify_bpl', {
      annualIncome: bplResult.annualIncome,
      monthlyIncome: bplResult.monthlyIncome,
      transactionCount: wageRecords.length,
      trend: trendResult.changePercent
    });
    
    return {
      success: true,
      ...bplResult,
      trend: trendResult,
      aiClassification: aiResult.success ? aiResult.data : null
    };
  } catch (error) {
    logger.error('BPL classification failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Predict future income trends
 */
export const predictIncome = async (workerData, wageRecords) => {
  try {
    const trend = calculateIncomeTrend(wageRecords, 6);
    
    const predictions = {
      nextMonth: null,
      nextQuarter: null,
      confidence: 'low'
    };
    
    if (wageRecords.length >= 3 && trend.trend !== 'insufficient_data') {
      const avgMonthly = wageRecords.reduce((sum, r) => sum + r.amount, 0) / 
                        Math.max(trend.periodData.length, 1);
      
      const growthRate = trend.changePercent / 100;
      
      predictions.nextMonth = Math.round(avgMonthly * (1 + growthRate / 6));
      predictions.nextQuarter = Math.round(avgMonthly * 3 * (1 + growthRate / 2));
      predictions.confidence = wageRecords.length > 6 ? 'high' : 'medium';
    }
    
    return {
      success: true,
      trend,
      predictions
    };
  } catch (error) {
    logger.error('Income prediction failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Run Python AI model
 */
const runPythonModel = (modelType, inputData) => {
  return new Promise((resolve) => {
    try {
      let scriptPath;
      
      switch (modelType) {
        case 'detect_anomaly':
          scriptPath = path.join(AI_MODEL_PATH, 'anomaly_detection_model', 'detect_anomaly.py');
          break;
        case 'classify_bpl':
          scriptPath = path.join(AI_MODEL_PATH, 'apl_bpl_model', 'classify_household.py');
          break;
        default:
          return resolve({ success: false, error: 'Unknown model type' });
      }
      
      const python = spawn('python', [scriptPath, JSON.stringify(inputData)]);
      
      let output = '';
      let errorOutput = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          logger.warn(`Python model exited with code ${code}:`, errorOutput);
          return resolve({ success: false, error: errorOutput });
        }
        
        try {
          const result = JSON.parse(output);
          resolve({ success: true, data: result });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse model output' });
        }
      });
      
      python.on('error', (err) => {
        logger.warn('Python model not available:', err.message);
        resolve({ success: false, error: err.message });
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        python.kill();
        resolve({ success: false, error: 'Model timeout' });
      }, 10000);
      
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
};

export default {
  detectAnomaly,
  classifyBPL,
  classifyHousehold,
  predictIncome
};
