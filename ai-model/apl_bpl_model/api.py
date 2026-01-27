"""
TRACIENT - Unified AI API
REST API for APL/BPL classification AND Income Anomaly Detection using Flask
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import json
import os
import sys
import numpy as np
import pandas as pd
from typing import Dict, Any, List

# Add parent directory to path for importing anomaly detection module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = Flask(__name__)
CORS(app)

# ============================================================================
# CONSTANTS
# ============================================================================

POVERTY_LINE_RURAL = 816.0  # Rs per month per capita
POVERTY_LINE_URBAN = 1000.0

# ============================================================================
# MODEL PREDICTOR CLASS
# ============================================================================

class ModelPredictor:
    """ML Model for APL/BPL classification"""
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.label_encoders = None
        self.feature_names = None
        self.is_loaded = False
    
    def load(self):
        """Load model components"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        try:
            self.model = joblib.load(os.path.join(script_dir, 'random_forest_model.joblib'))
            self.scaler = joblib.load(os.path.join(script_dir, 'scaler.joblib'))
            self.label_encoders = joblib.load(os.path.join(script_dir, 'label_encoders.joblib'))
            
            with open(os.path.join(script_dir, 'feature_names.json'), 'r') as f:
                self.feature_names = json.load(f)
            
            self.is_loaded = True
            print("✅ Model loaded successfully!")
            return True
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return False
    
    def preprocess(self, data: Dict[str, Any]) -> pd.DataFrame:
        """Preprocess data for prediction"""
        
        # Set default values for missing fields
        defaults = {
            'family_size': 4,
            'head_age': 35,
            'children_0_6': 0,
            'children_6_14': 0,
            'adults_16_59': 2,
            'adult_males_16_59': 1,
            'adult_females_16_59': 1,
            'elderly_60_plus': 0,
            'able_bodied_adults': 2,
            'working_members': 1,
            'literate_adults_above_25': 1,
            'children_in_school': 0,
            'is_female_headed': 0,
            'is_pvtg': 0,
            'is_minority': 0,
            'is_informal': 1,
            'education_code': 2,
            'highest_earner_monthly': 5000,
            'total_land_acres': 0,
            'irrigated_land_acres': 0,
            'crop_seasons': 0,
            'kcc_limit': 0,
            'owns_two_wheeler': 0,
            'owns_four_wheeler': 0,
            'owns_tractor': 0,
            'owns_mechanized_equipment': 0,
            'owns_refrigerator': 0,
            'owns_landline': 0,
            'owns_tv': 0,
            'owns_mobile': 1,
            'has_bank_account': 1,
            'has_savings': 0,
            'has_loan': 0,
            'loan_source': 'none',
            'house_type': 'kucha',
            'num_rooms': 1,
            'has_electricity': 1,
            'has_water_tap': 0,
            'has_toilet': 0,
            'is_houseless': 0,
            'state': 'Kerala',
            'area_type': 'rural',
            'social_category': 'General',
            'highest_education': 'primary_5',
            'primary_occupation': 'casual_labor',
            'ration_card_type': 'None',
            'has_disabled_member': 0,
            'has_chronic_illness': 0,
            'is_destitute': 0,
            'is_manual_scavenger': 0,
            'is_bonded_laborer': 0,
            'pays_income_tax': 0,
            'pays_professional_tax': 0,
            'has_govt_employee': 0,
            'receives_welfare': 0
        }
        
        # Merge defaults with provided data
        for key, value in defaults.items():
            if key not in data:
                data[key] = value
        
        # Convert boolean fields to integers
        bool_fields = ['owns_two_wheeler', 'owns_four_wheeler', 'owns_tractor', 
                       'owns_mechanized_equipment', 'owns_refrigerator', 'owns_landline',
                       'owns_tv', 'owns_mobile', 'has_bank_account', 'has_savings', 'has_loan']
        for field in bool_fields:
            if isinstance(data.get(field), bool):
                data[field] = 1 if data[field] else 0
        
        df = pd.DataFrame([data])
        
        # Calculate derived income fields
        family_size = df['family_size'].iloc[0] or 1
        monthly_income = df.get('highest_earner_monthly', pd.Series([5000])).iloc[0] or 5000
        
        df['total_monthly_income'] = monthly_income
        df['monthly_per_capita_income'] = monthly_income / family_size
        df['annual_income'] = monthly_income * 12
        df['income_std'] = monthly_income * 0.2
        df['income_variance'] = (monthly_income * 0.2) ** 2
        
        # Add engineered features
        df['income_threshold_ratio'] = df['monthly_per_capita_income'] / POVERTY_LINE_RURAL
        df['income_per_member'] = df['annual_income'] / df['family_size']
        df['working_ratio'] = df['working_members'] / (df['adults_16_59'] + 0.01)
        df['dependency_ratio'] = (df['children_0_6'] + df['children_6_14'] + df['elderly_60_plus']) / (df['adults_16_59'] + 0.01)
        
        df['asset_score'] = (
            df.get('owns_two_wheeler', 0) + 
            df.get('owns_four_wheeler', 0) * 3 + 
            df.get('owns_tractor', 0) * 3 + 
            df.get('owns_refrigerator', 0) + 
            df.get('owns_tv', 0) + 
            df.get('has_bank_account', 0)
        )
        
        house_scores = {'houseless': 0, 'temporary_plastic': 1, 'kucha': 2, 'semi_pucca': 3, 'pucca': 4}
        df['housing_score'] = house_scores.get(str(df['house_type'].iloc[0]), 2) + df['num_rooms'].iloc[0] * 0.5
        
        df['financial_score'] = df.get('has_bank_account', 0) + df.get('has_savings', 0) + 0.2
        
        social_cat = str(df.get('social_category', pd.Series(['General'])).iloc[0])
        is_sc_st = social_cat in ['SC', 'ST']
        df['vulnerability_score'] = (
            df.get('is_female_headed', 0) + 
            df.get('has_disabled_member', 0) + 
            df.get('has_chronic_illness', 0) + 
            int(is_sc_st)
        )
        
        df['has_exclusion_criteria'] = (
            (df.get('owns_two_wheeler', 0) == 1) | 
            (df.get('owns_four_wheeler', 0) == 1) |
            (df.get('has_govt_employee', 0) == 1) |
            (df.get('pays_income_tax', 0) == 1)
        ).astype(int)
        
        df['has_inclusion_criteria'] = (
            (df.get('is_houseless', 0) == 1) | 
            (df.get('is_destitute', 0) == 1) |
            (df.get('is_manual_scavenger', 0) == 1) |
            (df.get('is_bonded_laborer', 0) == 1) |
            (df.get('is_pvtg', 0) == 1)
        ).astype(int)
        
        df['deprivation_score'] = 0
        area_type = str(df.get('area_type', pd.Series(['rural'])).iloc[0])
        df['poverty_line_per_capita'] = POVERTY_LINE_RURAL if area_type == 'rural' else POVERTY_LINE_URBAN
        df['bpl_threshold'] = df['poverty_line_per_capita'] * 12 * df['family_size']
        
        # Transaction related defaults
        df['num_transactions'] = 24
        df['avg_transaction_amount'] = monthly_income / 4
        df['digital_payment_ratio'] = 0.2
        
        # Encode categorical features
        categorical_cols = ['state', 'area_type', 'social_category', 'house_type',
                           'highest_education', 'primary_occupation', 'loan_source', 'ration_card_type']
        
        for col in categorical_cols:
            if col in self.label_encoders and col in df.columns:
                try:
                    df[col] = self.label_encoders[col].transform(df[col].astype(str))
                except ValueError:
                    df[col] = 0
        
        # Create feature DataFrame
        X = pd.DataFrame(columns=self.feature_names)
        for col in self.feature_names:
            if col in df.columns:
                X[col] = df[col].values
            else:
                X[col] = 0
        
        X = X.astype(float)
        
        try:
            X_scaled = self.scaler.transform(X)
            X = pd.DataFrame(X_scaled, columns=self.feature_names)
        except:
            pass
        
        return X
    
    def predict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Make prediction"""
        
        if not self.is_loaded:
            return {
                'success': False,
                'error': 'Model not loaded'
            }
        
        try:
            X = self.preprocess(data)
            prediction = self.model.predict(X)[0]
            probabilities = self.model.predict_proba(X)[0]
            
            return {
                'success': True,
                'classification': 'APL' if prediction == 1 else 'BPL',
                'confidence': round(float(max(probabilities) * 100), 2),
                'bpl_probability': round(float(probabilities[0] * 100), 2),
                'apl_probability': round(float(probabilities[1] * 100), 2),
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

# ============================================================================
# SECC ANALYSIS
# ============================================================================

def analyze_secc_criteria(data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze household against SECC 2011 criteria"""
    
    # Convert boolean to int for analysis
    def to_int(val):
        if isinstance(val, bool):
            return 1 if val else 0
        return val or 0
    
    # Check exclusion criteria
    exclusion_criteria = {
        'Owns motorized 2-wheeler': to_int(data.get('owns_two_wheeler', 0)) == 1,
        'Owns 3/4 wheeler': to_int(data.get('owns_four_wheeler', 0)) == 1,
        'Owns tractor/harvester': to_int(data.get('owns_tractor', 0)) == 1,
        'Owns mechanized equipment': to_int(data.get('owns_mechanized_equipment', 0)) == 1,
        'KCC limit >= Rs.50,000': data.get('kcc_limit', 0) >= 50000,
        'Has government employee': to_int(data.get('has_govt_employee', 0)) == 1,
        'Pays income tax': to_int(data.get('pays_income_tax', 0)) == 1,
        'Pays professional tax': to_int(data.get('pays_professional_tax', 0)) == 1,
        'Owns refrigerator': to_int(data.get('owns_refrigerator', 0)) == 1,
        'Owns landline phone': to_int(data.get('owns_landline', 0)) == 1,
        'Pucca house with 3+ rooms': (
            data.get('house_type', '') == 'pucca' and 
            data.get('num_rooms', 0) >= 3
        ),
        'Owns 2.5+ acres land': data.get('total_land_acres', 0) >= 2.5,
    }
    
    # Check inclusion criteria (automatic BPL)
    inclusion_criteria = {
        'Houseless': to_int(data.get('is_houseless', 0)) == 1,
        'Destitute (living on alms)': to_int(data.get('is_destitute', 0)) == 1,
        'Manual scavenger': to_int(data.get('is_manual_scavenger', 0)) == 1,
        'Primitive Tribal Group': to_int(data.get('is_pvtg', 0)) == 1,
        'Bonded laborer': to_int(data.get('is_bonded_laborer', 0)) == 1,
    }
    
    # Check deprivation indicators
    deprivation_indicators = {
        'One room kucha house': (
            data.get('house_type', '') in ['kucha', 'houseless', 'temporary_plastic'] and
            data.get('num_rooms', 0) <= 1
        ),
        'No adult member (16-59)': data.get('adults_16_59', 0) == 0,
        'Female-headed, no adult male': (
            to_int(data.get('is_female_headed', 0)) == 1 and
            data.get('adult_males_16_59', 0) == 0
        ),
        'Has disabled member': to_int(data.get('has_disabled_member', 0)) == 1,
        'No literate adult above 25': data.get('literate_adults_above_25', 0) == 0,
        'Landless manual/casual labor': (
            data.get('total_land_acres', 0) == 0 and
            data.get('primary_occupation', '') in ['agricultural_labor', 'casual_labor', 'non_agricultural_labor']
        ),
        'SC/ST household': data.get('social_category', '') in ['SC', 'ST'],
        'Low monthly income': data.get('highest_earner_monthly', 0) < 5000,
    }
    
    has_exclusion = any(exclusion_criteria.values())
    has_inclusion = any(inclusion_criteria.values())
    deprivation_count = sum(deprivation_indicators.values())
    
    # Determine SECC classification
    if has_inclusion:
        secc_class = 'BPL'
        secc_reason = 'Automatic Inclusion'
    elif has_exclusion:
        secc_class = 'APL'
        secc_reason = 'Automatic Exclusion'
    elif deprivation_count >= 1:
        secc_class = 'BPL'
        secc_reason = f'{deprivation_count} deprivation indicator(s)'
    else:
        secc_class = 'APL'
        secc_reason = 'No deprivation indicators'
    
    return {
        'secc_classification': secc_class,
        'secc_reason': secc_reason,
        'has_exclusion': has_exclusion,
        'has_inclusion': has_inclusion,
        'deprivation_count': deprivation_count,
        'exclusion_met': [k for k, v in exclusion_criteria.items() if v],
        'inclusion_met': [k for k, v in inclusion_criteria.items() if v],
        'deprivation_met': [k for k, v in deprivation_indicators.items() if v],
    }

# ============================================================================
# ANOMALY DETECTION - Import from sibling module
# ============================================================================

# Anomaly detection constants
ANOMALY_DESCRIPTIONS = {
    'sudden_spike': '⚠️ SUDDEN SPIKE: Income jumped 3x+ above personal average',
    'high_volatility': '⚠️ HIGH VOLATILITY: Income varies wildly month-to-month',
    'irregular_timing': '⚠️ IRREGULAR TIMING: Transactions at unusual hours/weekends',
    'new_sources': '⚠️ NEW SOURCES: Multiple new income sources appeared suddenly',
    'round_amounts': '⚠️ ROUND AMOUNTS: Suspiciously round transaction amounts',
    'structuring': '⚠️ STRUCTURING: Many transactions just below reporting thresholds',
    'velocity_change': '⚠️ VELOCITY CHANGE: Transaction frequency changed dramatically',
    'dormant_burst': '⚠️ DORMANT BURST: Large activity after months of inactivity',
    'pattern_break': '⚠️ PATTERN BREAK: Regular payment pattern suddenly broke',
    'ghost_income': '⚠️ GHOST INCOME: Income from unverifiable sources',
    'weekend_heavy': '⚠️ WEEKEND HEAVY: Unusual concentration of weekend transactions',
}

class AnomalyDetector:
    """ML-based anomaly detector"""
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.label_encoders = None
        self.feature_names = None
        self.is_loaded = False
    
    def load(self):
        """Load model components from anomaly_detection_model directory"""
        # Path to anomaly detection model directory
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_dir = os.path.join(base_dir, 'anomaly_detection_model')
        
        try:
            model_path = os.path.join(model_dir, 'anomaly_detection_model.joblib')
            scaler_path = os.path.join(model_dir, 'anomaly_scaler.joblib')
            encoders_path = os.path.join(model_dir, 'anomaly_label_encoders.joblib')
            features_path = os.path.join(model_dir, 'anomaly_feature_names.json')
            
            if os.path.exists(model_path):
                self.model = joblib.load(model_path)
            if os.path.exists(scaler_path):
                self.scaler = joblib.load(scaler_path)
            if os.path.exists(encoders_path):
                self.label_encoders = joblib.load(encoders_path)
            if os.path.exists(features_path):
                with open(features_path, 'r') as f:
                    self.feature_names = json.load(f)
            
            self.is_loaded = self.model is not None
            if self.is_loaded:
                print("✅ Anomaly detection model loaded successfully!")
            else:
                print("⚠️ Anomaly detection model not found - using rule-based only")
            return self.is_loaded
        except Exception as e:
            print(f"⚠️ Error loading anomaly model: {e}")
            return False
    
    def preprocess(self, worker_data: Dict, pattern_data: Dict, income_data: Dict) -> np.ndarray:
        """Preprocess data for prediction using pattern features"""
        
        # Combine all data
        data = {**worker_data, **pattern_data, **income_data}
        
        # Encode categorical variables
        categorical_cols = ['sector', 'income_tier']
        if self.label_encoders:
            for col in categorical_cols:
                if col in self.label_encoders and col in data:
                    try:
                        data[col + '_encoded'] = self.label_encoders[col].transform([data[col]])[0]
                    except:
                        data[col + '_encoded'] = 0
        
        # Create feature vector using pattern-based features
        feature_vector = []
        feature_names = self.feature_names if isinstance(self.feature_names, list) else (self.feature_names.get('feature_names', []) if self.feature_names else [])
        
        for feature in feature_names:
            if feature in data:
                feature_vector.append(data[feature])
            else:
                feature_vector.append(0)
        
        # Scale features if scaler available
        X = np.array(feature_vector).reshape(1, -1)
        if self.scaler:
            X = self.scaler.transform(X)
        
        return X
    
    def detect(self, worker_data: Dict, pattern_data: Dict, income_data: Dict) -> Dict[str, Any]:
        """Detect anomalies based on patterns"""
        
        if not self.is_loaded:
            return {
                'is_anomaly': False,
                'anomaly_score': 0,
                'confidence': 0,
                'note': 'ML model not available'
            }
        
        X = self.preprocess(worker_data, pattern_data, income_data)
        
        # Get prediction
        if hasattr(self.model, 'predict_proba'):
            prediction = self.model.predict(X)[0]
            probabilities = self.model.predict_proba(X)[0]
            anomaly_score = probabilities[1] * 100
        else:
            # For Isolation Forest
            prediction = self.model.predict(X)[0]
            prediction = 1 if prediction == -1 else 0
            anomaly_score = 50 if prediction == 1 else 10
        
        return {
            'is_anomaly': bool(prediction == 1),
            'anomaly_score': round(anomaly_score, 2),
            'confidence': round(max(anomaly_score, 100 - anomaly_score), 2),
        }


def rule_based_anomaly_detection(income_data: Dict, pattern_data: Dict) -> List[str]:
    """Pattern-based anomaly detection using rules"""
    
    anomalies = []
    
    # 1. Check income volatility (CV > 0.5 is suspicious)
    if income_data.get('income_cv', 0) > 0.5:
        anomalies.append('high_volatility')
    
    # 2. Check for sudden spikes (>3x month-over-month increase)
    if income_data.get('max_mom_increase', 0) > 3:
        anomalies.append('sudden_spike')
    
    # 3. Check for pattern breaks (high deviation from personal average)
    if income_data.get('max_deviation_from_mean', 0) > 2:
        anomalies.append('pattern_break')
    
    # 4. Check for structuring (many transactions near thresholds)
    if pattern_data.get('near_50k_pct', 0) > 0.3 or pattern_data.get('near_200k_pct', 0) > 0.2:
        anomalies.append('structuring')
    
    # 5. Check for round amount suspicion
    if pattern_data.get('round_amount_pct', 0) > 0.6:
        anomalies.append('round_amounts')
    
    # 6. Check for unusual timing
    if pattern_data.get('night_hours_pct', 0) > 0.3 or pattern_data.get('weekend_pct', 0) > 0.5:
        anomalies.append('irregular_timing')
    
    # 7. Check for velocity changes
    if pattern_data.get('velocity_change', 1) > 3 or pattern_data.get('velocity_change', 1) < 0.3:
        anomalies.append('velocity_change')
    
    # 8. Check for transaction bursts
    if pattern_data.get('burst_ratio', 1) > 5:
        anomalies.append('dormant_burst')
    
    # 9. Check for new sources suddenly appearing
    if pattern_data.get('new_source_rate', 0) > 0.5:
        anomalies.append('new_sources')
    
    # 10. Check for low verification
    if pattern_data.get('unverified_rate', 0) > 0.5:
        anomalies.append('ghost_income')
    
    # 11. Check for excessive weekend transactions
    if pattern_data.get('weekend_pct', 0) > 0.4:
        anomalies.append('weekend_heavy')
    
    # Remove duplicates
    return list(set(anomalies))


# ============================================================================
# INITIALIZE MODELS
# ============================================================================

# APL/BPL Classification Model
predictor = ModelPredictor()
model_loaded = predictor.load()

# Anomaly Detection Model
anomaly_detector = AnomalyDetector()
anomaly_model_loaded = anomaly_detector.load()

# ============================================================================
# API ROUTES
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'bpl_model_loaded': predictor.is_loaded,
        'anomaly_model_loaded': anomaly_detector.is_loaded,
        'services': {
            'bpl_classification': 'available' if predictor.is_loaded else 'unavailable',
            'anomaly_detection': 'available' if anomaly_detector.is_loaded else 'rule-based only'
        }
    })

@app.route('/classify', methods=['POST'])
def classify_household():
    """
    Classify a household as APL or BPL
    
    Expected JSON body with household data from survey
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Get ML prediction
        ml_result = predictor.predict(data)
        
        # Get SECC analysis
        secc_result = analyze_secc_criteria(data)
        
        # Combine results
        final_classification = secc_result['secc_classification']
        
        # If SECC has automatic inclusion/exclusion, use that
        # Otherwise, use ML prediction with SECC deprivation count as tiebreaker
        if secc_result['has_inclusion']:
            final_classification = 'BPL'
            reason = 'Automatic inclusion criteria met'
        elif secc_result['has_exclusion']:
            final_classification = 'APL'
            reason = 'Automatic exclusion criteria met'
        elif ml_result.get('success') and ml_result.get('classification'):
            final_classification = ml_result['classification']
            reason = f"ML model prediction ({ml_result['confidence']}% confidence)"
        else:
            final_classification = secc_result['secc_classification']
            reason = secc_result['secc_reason']
        
        # Build response
        response = {
            'success': True,
            'classification': final_classification,
            'reason': reason,
            'ml_prediction': ml_result if ml_result.get('success') else None,
            'secc_analysis': secc_result,
            'recommendation': get_recommendation(final_classification, secc_result, ml_result)
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def get_recommendation(classification: str, secc: Dict, ml: Dict) -> Dict:
    """Generate recommendation based on classification"""
    
    if classification == 'BPL':
        if secc['has_inclusion']:
            priority = 'HIGH'
            message = 'Qualifies for automatic BPL inclusion. Immediate enrollment in welfare programs recommended.'
        elif secc['deprivation_count'] >= 3:
            priority = 'HIGH'
            message = f'Multiple deprivation indicators ({secc["deprivation_count"]}). Priority enrollment recommended.'
        else:
            priority = 'MEDIUM'
            message = 'Eligible for BPL benefits. Standard enrollment process applies.'
        
        eligible_schemes = [
            'Public Distribution System (PDS)',
            'MGNREGA',
            'PM Awas Yojana',
            'Ayushman Bharat',
            'National Food Security Act benefits'
        ]
    else:
        priority = 'LOW'
        message = 'Above poverty line. Not eligible for BPL benefits.'
        eligible_schemes = []
    
    return {
        'priority': priority,
        'message': message,
        'eligible_schemes': eligible_schemes,
        'deprivation_indicators': secc.get('deprivation_met', []),
        'exclusion_indicators': secc.get('exclusion_met', [])
    }

@app.route('/batch-classify', methods=['POST'])
def batch_classify():
    """Classify multiple households at once"""
    try:
        data = request.get_json()
        
        if not data or not isinstance(data, list):
            return jsonify({
                'success': False,
                'error': 'Expected array of household data'
            }), 400
        
        results = []
        for household in data:
            ml_result = predictor.predict(household)
            secc_result = analyze_secc_criteria(household)
            
            results.append({
                'household_id': household.get('ration_no', 'unknown'),
                'ml_classification': ml_result.get('classification'),
                'secc_classification': secc_result['secc_classification'],
                'confidence': ml_result.get('confidence', 0)
            })
        
        return jsonify({
            'success': True,
            'results': results,
            'total': len(results)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# ANOMALY DETECTION ROUTES
# ============================================================================

@app.route('/detect-anomaly', methods=['POST'])
def detect_anomaly():
    """
    Detect anomalies in income patterns for a single worker
    
    Expected JSON body:
    {
        "worker_data": {
            "sector": "construction",
            "is_formal": 0,
            "income_tier": "low",
            "account_age_months": 24
        },
        "pattern_data": {
            "avg_tx_per_month": 10,
            "weekend_pct": 0.1,
            "night_hours_pct": 0.05,
            "round_amount_pct": 0.15,
            "near_50k_pct": 0.05,
            "num_unique_sources": 2,
            "source_concentration": 0.8,
            "unverified_rate": 0.2,
            "velocity_change": 1.0,
            "burst_ratio": 1.5,
            "cash_deposit_rate": 0.15
        },
        "income_data": {
            "income_cv": 0.3,
            "max_mom_increase": 0.5,
            "max_deviation_from_mean": 0.8,
            "monthly_incomes": [15000, 16000, 14500, ...]
        }
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        worker_data = data.get('worker_data', {})
        pattern_data = data.get('pattern_data', {})
        income_data = data.get('income_data', {})
        
        # Run ML-based detection
        ml_result = anomaly_detector.detect(worker_data, pattern_data, income_data)
        
        # Run rule-based detection
        rule_anomalies = rule_based_anomaly_detection(income_data, pattern_data)
        
        # Combine results
        is_anomaly = ml_result.get('is_anomaly', False) or len(rule_anomalies) > 0
        anomaly_score = ml_result.get('anomaly_score', 0)
        
        # Boost score based on rule detections
        if rule_anomalies:
            rule_boost = min(len(rule_anomalies) * 15, 50)
            anomaly_score = min(anomaly_score + rule_boost, 100)
        
        # Determine severity
        if anomaly_score >= 80:
            severity = 'critical'
        elif anomaly_score >= 60:
            severity = 'high'
        elif anomaly_score >= 40:
            severity = 'medium'
        else:
            severity = 'low'
        
        return jsonify({
            'success': True,
            'is_anomaly': is_anomaly,
            'anomaly_score': round(anomaly_score, 2),
            'confidence': ml_result.get('confidence', 0),
            'severity': severity,
            'anomaly_types': rule_anomalies,
            'anomaly_descriptions': [ANOMALY_DESCRIPTIONS.get(a, a) for a in rule_anomalies],
            'ml_result': ml_result,
            'detection_method': 'ml_and_rules' if anomaly_detector.is_loaded else 'rules_only'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/batch-detect-anomaly', methods=['POST'])
def batch_detect_anomaly():
    """
    Detect anomalies for multiple workers at once
    
    Expected JSON body:
    {
        "workers": [
            {
                "worker_id": "WRK001",
                "worker_data": {...},
                "pattern_data": {...},
                "income_data": {...}
            },
            ...
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'workers' not in data:
            return jsonify({
                'success': False,
                'error': 'Expected { workers: [...] } array'
            }), 400
        
        workers = data.get('workers', [])
        results = []
        anomalies_found = 0
        
        for worker in workers:
            worker_id = worker.get('worker_id', 'unknown')
            worker_data = worker.get('worker_data', {})
            pattern_data = worker.get('pattern_data', {})
            income_data = worker.get('income_data', {})
            
            # Run ML-based detection
            ml_result = anomaly_detector.detect(worker_data, pattern_data, income_data)
            
            # Run rule-based detection
            rule_anomalies = rule_based_anomaly_detection(income_data, pattern_data)
            
            # Combine results
            is_anomaly = ml_result.get('is_anomaly', False) or len(rule_anomalies) > 0
            anomaly_score = ml_result.get('anomaly_score', 0)
            
            if rule_anomalies:
                rule_boost = min(len(rule_anomalies) * 15, 50)
                anomaly_score = min(anomaly_score + rule_boost, 100)
            
            if is_anomaly:
                anomalies_found += 1
            
            # Determine severity
            if anomaly_score >= 80:
                severity = 'critical'
            elif anomaly_score >= 60:
                severity = 'high'
            elif anomaly_score >= 40:
                severity = 'medium'
            else:
                severity = 'low'
            
            results.append({
                'worker_id': worker_id,
                'is_anomaly': is_anomaly,
                'anomaly_score': round(anomaly_score, 2),
                'severity': severity,
                'anomaly_types': rule_anomalies
            })
        
        return jsonify({
            'success': True,
            'total_scanned': len(workers),
            'anomalies_found': anomalies_found,
            'results': results,
            'detection_method': 'ml_and_rules' if anomaly_detector.is_loaded else 'rules_only'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('AI_MODEL_PORT', 5001))
    print(f"\n🚀 TRACIENT Unified AI API")
    print(f"   Running on http://localhost:{port}")
    print(f"   ├── BPL/APL Classification: {'✅ Ready' if predictor.is_loaded else '❌ Not loaded'}")
    print(f"   └── Anomaly Detection: {'✅ ML Ready' if anomaly_detector.is_loaded else '⚠️ Rule-based only'}")
    print(f"\n   Endpoints:")
    print(f"   ├── GET  /health             - Health check")
    print(f"   ├── POST /classify           - Classify household")
    print(f"   ├── POST /batch-classify     - Batch classification")
    print(f"   ├── POST /detect-anomaly     - Detect anomalies (single)")
    print(f"   └── POST /batch-detect-anomaly - Batch anomaly detection\n")
    
    app.run(host='0.0.0.0', port=port, debug=False)
