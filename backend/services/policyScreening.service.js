/**
 * Policy Screening Service
 * Applies policy-based overrides to AI classification results
 */
import { ClassificationOverride, SystemMetadata, Family } from '../models/index.js';
import { logger } from '../utils/logger.util.js';

/**
 * Evaluate a single rule against family data
 * @param {Object} rule - The rule to evaluate { field, operator, value }
 * @param {Object} familyData - The family data to check
 * @returns {boolean} Whether the rule matches
 */
const evaluateRule = (rule, familyData) => {
  const { field, operator, value } = rule;
  const fieldValue = familyData[field];
  
  // Handle undefined/null field values
  if (fieldValue === undefined || fieldValue === null) {
    if (['is_false', 'not_contains', 'not_equals'].includes(operator)) {
      return true;
    }
    return false;
  }
  
  switch (operator) {
    case 'equals':
      return fieldValue == value; // Use loose equality for type coercion
    case 'not_equals':
      return fieldValue != value;
    case 'greater_than':
      return Number(fieldValue) > Number(value);
    case 'less_than':
      return Number(fieldValue) < Number(value);
    case 'greater_than_or_equal':
      return Number(fieldValue) >= Number(value);
    case 'less_than_or_equal':
      return Number(fieldValue) <= Number(value);
    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'not_contains':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value);
      }
      return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'is_true':
      return fieldValue === true || fieldValue === 1 || fieldValue === '1' || fieldValue === 'true';
    case 'is_false':
      return fieldValue === false || fieldValue === 0 || fieldValue === '0' || fieldValue === 'false';
    default:
      logger.warn(`Unknown operator: ${operator}`);
      return false;
  }
};

/**
 * Check if a policy's rules match the family data
 * @param {Object} policy - The classification override policy
 * @param {Object} familyData - The family data to check
 * @returns {boolean} Whether all rules match (AND logic) or any rule matches (OR logic)
 */
const policyMatchesFamily = (policy, familyData) => {
  if (!policy.rules || policy.rules.length === 0) {
    return false;
  }
  
  const results = policy.rules.map(rule => evaluateRule(rule, familyData));
  
  if (policy.ruleLogic === 'OR') {
    return results.some(r => r);
  }
  // Default is AND
  return results.every(r => r);
};

/**
 * Check if a policy targets any of the exclusion/inclusion criteria that classified the family
 * @param {Object} policy - The classification override policy
 * @param {Object} classificationResult - The AI classification result with secc_exclusion_met, etc.
 * @returns {boolean} Whether the policy targets the classification criteria
 */
const policyTargetsClassificationCriteria = (policy, classificationResult) => {
  if (!policy.targetCriteria || policy.targetCriteria.length === 0) {
    return true; // No specific criteria targeted, apply to all
  }
  
  const allCriteriaMet = [
    ...(classificationResult.secc_exclusion_met || []),
    ...(classificationResult.secc_inclusion_met || []),
    ...(classificationResult.secc_deprivation_met || [])
  ];
  
  // Check if any of the policy's target criteria match the criteria that classified this family
  return policy.targetCriteria.some(target => 
    allCriteriaMet.some(criterion => 
      criterion.toLowerCase().includes(target.toLowerCase()) ||
      target.toLowerCase().includes(criterion.toLowerCase())
    )
  );
};

/**
 * Screen a single classification result against active policies
 * @param {Object} classificationResult - The AI classification result
 * @param {Object} familyData - The original family survey data
 * @param {Array} activePolicies - Optional pre-fetched active policies
 * @returns {Object} Screened classification result with any overrides applied
 */
export const screenClassification = async (classificationResult, familyData, activePolicies = null) => {
  try {
    // Get active policies if not provided
    const policies = activePolicies || await ClassificationOverride.getActivePolicies();
    
    if (!policies || policies.length === 0) {
      return {
        ...classificationResult,
        policy_screened: true,
        policy_overrides_applied: []
      };
    }
    
    let screenedResult = { ...classificationResult };
    const overridesApplied = [];
    
    // Process policies in priority order (highest first)
    for (const policy of policies) {
      // Skip if policy doesn't match family data
      if (!policyMatchesFamily(policy, familyData)) {
        continue;
      }
      
      // For ignore_criterion action, check if policy targets the classification criteria
      if (policy.action === 'ignore_criterion') {
        if (!policyTargetsClassificationCriteria(policy, classificationResult)) {
          continue;
        }
      }
      
      // Apply the policy action
      switch (policy.action) {
        case 'reclassify_to_bpl':
          if (screenedResult.classification === 'APL') {
            screenedResult.classification = 'BPL';
            screenedResult.classification_reason = `Reclassified by policy: ${policy.name}`;
            overridesApplied.push({
              policyId: policy.policyId,
              policyName: policy.name,
              action: 'reclassify_to_bpl',
              originalClassification: classificationResult.classification
            });
          }
          break;
          
        case 'reclassify_to_apl':
          if (screenedResult.classification === 'BPL') {
            screenedResult.classification = 'APL';
            screenedResult.classification_reason = `Reclassified by policy: ${policy.name}`;
            overridesApplied.push({
              policyId: policy.policyId,
              policyName: policy.name,
              action: 'reclassify_to_apl',
              originalClassification: classificationResult.classification
            });
          }
          break;
          
        case 'ignore_criterion':
          // If the ONLY reason for APL classification was criteria that are now ignored, reclassify to BPL
          if (screenedResult.classification === 'APL' && classificationResult.secc_has_exclusion) {
            const remainingExclusions = (classificationResult.secc_exclusion_met || []).filter(criterion =>
              !policy.targetCriteria.some(target =>
                criterion.toLowerCase().includes(target.toLowerCase()) ||
                target.toLowerCase().includes(criterion.toLowerCase())
              )
            );
            
            if (remainingExclusions.length === 0) {
              // No remaining exclusion criteria, check if should be BPL
              const hasInclusion = classificationResult.secc_has_inclusion;
              const deprivationCount = classificationResult.secc_deprivation_count || 0;
              
              if (hasInclusion || deprivationCount >= 1) {
                screenedResult.classification = 'BPL';
                screenedResult.classification_reason = `Reclassified after ignoring criterion: ${policy.targetCriteria.join(', ')}`;
                screenedResult.secc_exclusion_met = remainingExclusions;
                screenedResult.secc_has_exclusion = false;
                overridesApplied.push({
                  policyId: policy.policyId,
                  policyName: policy.name,
                  action: 'ignore_criterion',
                  ignoredCriteria: policy.targetCriteria,
                  originalClassification: classificationResult.classification
                });
              }
            }
          }
          break;
          
        case 'flag_for_review':
          screenedResult.requires_manual_review = true;
          screenedResult.review_reason = `Flagged by policy: ${policy.name}`;
          overridesApplied.push({
            policyId: policy.policyId,
            policyName: policy.name,
            action: 'flag_for_review'
          });
          break;
      }
    }
    
    return {
      ...screenedResult,
      policy_screened: true,
      policy_overrides_applied: overridesApplied
    };
    
  } catch (error) {
    logger.error('Error in screenClassification:', error);
    return {
      ...classificationResult,
      policy_screened: false,
      policy_screening_error: error.message
    };
  }
};

/**
 * Bulk re-screen all families against current active policies
 * @param {string} triggeredBy - User ID who triggered the re-screening
 * @returns {Object} Summary of re-screening results
 */
export const bulkRescreen = async (triggeredBy) => {
  try {
    logger.info('Starting bulk policy re-screening...');
    
    // Get all active policies
    const activePolicies = await ClassificationOverride.getActivePolicies();
    
    if (!activePolicies || activePolicies.length === 0) {
      return {
        success: true,
        message: 'No active policies to apply',
        totalFamilies: 0,
        reclassified: 0,
        unchanged: 0,
        errors: 0
      };
    }
    
    // Get all classified families
    const families = await Family.find({
      classification: { $in: ['APL', 'BPL'] }
    });
    
    let reclassified = 0;
    let unchanged = 0;
    let errors = 0;
    const reclassificationDetails = [];
    
    for (const family of families) {
      try {
        // Reconstruct the classification result from stored data
        const storedClassificationResult = {
          classification: family.classification,
          classification_reason: family.classification_reason,
          secc_classification: family.secc_classification,
          secc_reason: family.secc_reason,
          secc_has_exclusion: family.secc_has_exclusion,
          secc_has_inclusion: family.secc_has_inclusion,
          secc_deprivation_count: family.secc_deprivation_count,
          secc_exclusion_met: family.secc_exclusion_met,
          secc_inclusion_met: family.secc_inclusion_met,
          secc_deprivation_met: family.secc_deprivation_met,
          ml_classification: family.ml_classification,
          ml_bpl_probability: family.ml_bpl_probability,
          ml_apl_probability: family.ml_apl_probability
        };
        
        // Screen against policies
        const screenedResult = await screenClassification(
          storedClassificationResult,
          family.toObject(),
          activePolicies
        );
        
        // Check if classification changed
        if (screenedResult.classification !== family.classification) {
          const oldClassification = family.classification;
          
          // Update the family record
          family.classification = screenedResult.classification;
          family.classification_reason = screenedResult.classification_reason;
          family.policy_overrides_applied = screenedResult.policy_overrides_applied;
          family.last_policy_screening = new Date();
          
          // Update secc fields if modified
          if (screenedResult.secc_exclusion_met) {
            family.secc_exclusion_met = screenedResult.secc_exclusion_met;
          }
          if (screenedResult.secc_has_exclusion !== undefined) {
            family.secc_has_exclusion = screenedResult.secc_has_exclusion;
          }
          
          await family.save();
          
          reclassified++;
          reclassificationDetails.push({
            ration_no: family.ration_no,
            oldClassification,
            newClassification: screenedResult.classification,
            overridesApplied: screenedResult.policy_overrides_applied
          });
          
          logger.info(`Family ${family.ration_no} reclassified from ${oldClassification} to ${screenedResult.classification}`);
        } else {
          unchanged++;
        }
        
      } catch (familyError) {
        errors++;
        logger.error(`Error processing family ${family.ration_no}:`, familyError);
      }
    }
    
    // Update system metadata to track last policy application
    await SystemMetadata.set('lastPolicyApplication', {
      timestamp: new Date(),
      triggeredBy,
      totalFamilies: families.length,
      reclassified,
      unchanged,
      errors,
      policiesApplied: activePolicies.map(p => ({ id: p.policyId, name: p.name }))
    });
    
    // Clear the policies modified flag
    await SystemMetadata.set('policiesModifiedSinceLastApply', false);
    
    logger.info(`Bulk re-screening completed: ${reclassified} reclassified, ${unchanged} unchanged, ${errors} errors`);
    
    return {
      success: true,
      message: 'Bulk policy re-screening completed',
      totalFamilies: families.length,
      reclassified,
      unchanged,
      errors,
      reclassificationDetails: reclassificationDetails.slice(0, 100), // Limit to first 100 for response size
      hasMoreDetails: reclassificationDetails.length > 100
    };
    
  } catch (error) {
    logger.error('Error in bulkRescreen:', error);
    throw error;
  }
};

/**
 * Mark that policies have been modified and need to be applied
 */
export const markPoliciesModified = async () => {
  await SystemMetadata.set('policiesModifiedSinceLastApply', true);
  await SystemMetadata.set('lastPolicyModification', new Date());
};

/**
 * Get the current policy application status
 */
export const getPolicyApplicationStatus = async () => {
  const [modified, lastModification, lastApplication] = await Promise.all([
    SystemMetadata.get('policiesModifiedSinceLastApply'),
    SystemMetadata.get('lastPolicyModification'),
    SystemMetadata.get('lastPolicyApplication')
  ]);
  
  return {
    policiesModifiedSinceLastApply: modified || false,
    lastPolicyModification: lastModification,
    lastPolicyApplication: lastApplication
  };
};

export default {
  screenClassification,
  bulkRescreen,
  markPoliciesModified,
  getPolicyApplicationStatus
};
