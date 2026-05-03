import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  GraduationCap, 
  Home, 
  Landmark, 
  Tractor,
  Zap,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Spinner } from '@/components/common';
import ClassificationResultModal from '@/components/family/ClassificationResultModal';
import { familyService } from '@/services';
import { FamilySurveyData, ClassificationResult, SurveySubmitResponse } from '@/types/family';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';

interface FormErrors {
  [key: string]: string;
}

const FamilySurvey: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showClassificationResult, setShowClassificationResult] = useState(false);
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [decimalInputText, setDecimalInputText] = useState<Record<string, string>>({});
  
  // Check if survey already exists
  React.useEffect(() => {
    const checkSurveyStatus = async () => {
      try {
        const { surveyCompleted } = await familyService.checkSurveyStatus();
        if (surveyCompleted) {
          // Survey already exists, redirect to family page
          navigate(user?.role === 'worker' ? '/worker/family' : '/employer/family', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error checking survey status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    };
    checkSurveyStatus();
  }, [navigate, user?.role]);
  
  const [formData, setFormData] = useState<FamilySurveyData>({
    ration_no: 0, // Will be ignored by backend
    family_size: 1,
    head_age: 18,
    children_0_6: 0,
    children_6_14: 0,
    adults_16_59: 1,
    adult_males_16_59: 0,
    adult_females_16_59: 0,    adult_other_16_59: 0,    elderly_60_plus: 0,
    able_bodied_adults: 1,
    working_members: 1,
    literate_adults_above_25: 0,
    children_in_school: 0,
    is_female_headed: 0,
    is_pvtg: 0,
    is_minority: 0,
    is_informal: 0,
    education_code: 0,
    highest_earner_monthly: 0,
    total_land_acres: 0,
    irrigated_land_acres: 0,
    crop_seasons: 0,
    owns_two_wheeler: false,
    owns_four_wheeler: false,
    owns_tractor: false,
    owns_mechanized_equipment: false,
    owns_refrigerator: false,
    owns_landline: false,
    owns_tv: false,
    owns_mobile: false,
    has_bank_account: false,
    has_savings: false,
    has_loan: false,
    loan_source: 'none',
    house_type: 'kucha',
    num_rooms: 1,
    has_electricity: 0,
    has_water_tap: 0,
    has_toilet: 0,
    is_houseless: 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Configuration for each numeric field: min, max, allowDecimal
  const numericFieldConfig: Record<string, { min: number; max: number; allowDecimal?: boolean }> = {
    family_size:             { min: 1,  max: 20 },
    head_age:                { min: 18, max: 120 },
    highest_earner_monthly:  { min: 0,  max: 9999999 },
    children_0_6:            { min: 0,  max: 15 },
    children_6_14:           { min: 0,  max: 15 },
    children_in_school:      { min: 0,  max: 15 },
    adults_16_59:            { min: 0,  max: 20 },
    adult_males_16_59:       { min: 0,  max: 15 },
    adult_females_16_59:     { min: 0,  max: 15 },
    elderly_60_plus:         { min: 0,  max: 15 },
    able_bodied_adults:      { min: 0,  max: 20 },
    working_members:         { min: 0,  max: 15 },
    literate_adults_above_25:{ min: 0,  max: 15 },
    total_land_acres:        { min: 0,  max: 999, allowDecimal: true },
    irrigated_land_acres:    { min: 0,  max: 999, allowDecimal: true },
    crop_seasons:            { min: 0,  max: 4 },
    num_rooms:               { min: 0,  max: 20 },
  };

  const handleNumericInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const config = numericFieldConfig[name];
    if (!config) return;

    // Allow empty string so user can clear field
    if (value === '') {
      if (config.allowDecimal) {
        setDecimalInputText(prev => ({ ...prev, [name]: '' }));
      }
      setFormData(prev => ({ ...prev, [name]: 0 }));
      return;
    }

    // Filter: allow only digits and optionally one decimal point
    const pattern = config.allowDecimal ? /^[0-9]*\.?[0-9]*$/ : /^[0-9]*$/;
    if (!pattern.test(value)) return; // reject non-numeric characters

    if (config.allowDecimal) {
      setDecimalInputText(prev => ({ ...prev, [name]: value }));
      if (value === '.' || value.endsWith('.')) return;
    }

    const num = config.allowDecimal ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(num)) return;
    if (num > config.max) return; // silently reject values above max

    setFormData(prev => ({ ...prev, [name]: num }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked ? 1 : 0
    }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {};
    
    if (step === 1) {
      // ration_no is auto-assigned from user, no validation needed
      if (formData.family_size < 1 || formData.family_size > 20) {
        newErrors.family_size = 'Family size must be between 1 and 20';
      }
      if (formData.head_age < 18 || formData.head_age > 100) {
        newErrors.head_age = 'Head age must be between 18 and 100';
      }
    }
    
    if (step === 2) {
      // Validate age groups sum equals family size
      const ageGroupTotal = (formData.children_0_6 || 0) + 
                            (formData.children_6_14 || 0) + 
                            (formData.adults_16_59 || 0) + 
                            (formData.elderly_60_plus || 0);
      
      if (ageGroupTotal !== formData.family_size) {
        newErrors.demographics = `Age groups total (${ageGroupTotal}) must equal family size (${formData.family_size})`;
        toast.error('Age groups must add up to total family members');
      }
      
      // Validate adult gender breakdown
      const adultsCount = formData.adults_16_59 || 0;
      const totalAdults = (formData.adult_males_16_59 || 0) + 
                          (formData.adult_females_16_59 || 0) + 
                          (formData.adult_other_16_59 || 0);
      
      if (adultsCount > 0 && totalAdults === 0) {
        newErrors.adult_gender = `You have ${adultsCount} adult(s). Please specify their gender (Male/Female/Other)`;
        toast.error('Adult gender breakdown is required');
      } else if (totalAdults !== adultsCount) {
        newErrors.adult_gender = `Adult gender breakdown (${totalAdults}) must equal total adults (${adultsCount})`;
        toast.error('Adult gender breakdown must match total adults');
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(currentStep)) return;
    
    setIsSubmitting(true);
    try {
      const response: SurveySubmitResponse = await familyService.submitSurvey(formData);
      
      // Check if classification result is available
      if (response.data?.classification) {
        setClassificationResult(response.data.classification);
        setShowClassificationResult(true);
      } else {
        // No classification result, navigate directly
        navigate(user?.role === 'worker' ? '/worker/family' : '/employer/family');
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to submit survey' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClassificationClose = () => {
    setShowClassificationResult(false);
    navigate(user?.role === 'worker' ? '/worker/family' : '/employer/family');
  };

  const handleClassificationContinue = () => {
    setShowClassificationResult(false);
    navigate(user?.role === 'worker' ? '/worker/family' : '/employer/family');
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: 'Basic Info' },
      { num: 2, label: 'Demographics' },
      { num: 3, label: 'Assets' },
      { num: 4, label: 'Housing' },
      { num: 5, label: 'Financial' },
    ];

    return (
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  currentStep >= step.num
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {currentStep > step.num ? <CheckCircle2 className="h-6 w-6" /> : step.num}
              </div>
              <span className="text-xs mt-2 text-gray-600">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 ${currentStep > step.num ? 'bg-primary-600' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> This survey will be linked to your ration number automatically. 
          All family members with the same ration number will share this information.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Total Family Members <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="family_size"
            value={formData.family_size}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="1–20"
          />
          {errors.family_size && <p className="text-red-500 text-sm mt-1">{errors.family_size}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Age of Household Head <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="head_age"
            value={formData.head_age}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="18–120"
          />
          {errors.head_age && <p className="text-red-500 text-sm mt-1">{errors.head_age}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Highest Monthly Income (₹)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="highest_earner_monthly"
            value={formData.highest_earner_monthly}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Monthly income in ₹"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Highest Education Level
          </label>
          <select
            name="education_code"
            value={formData.education_code}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="0">No Education</option>
            <option value="1">Primary (1-5)</option>
            <option value="2">Middle (6-8)</option>
            <option value="3">Secondary (9-10)</option>
            <option value="4">Higher Secondary (11-12)</option>
            <option value="5">Graduate</option>
            <option value="6">Post Graduate</option>
            <option value="7">Professional</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-3">Household Type</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_female_headed"
                checked={formData.is_female_headed === 1}
                onChange={(e) => handleCheckboxChange('is_female_headed', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm">Female-headed</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_pvtg"
                checked={formData.is_pvtg === 1}
                onChange={(e) => handleCheckboxChange('is_pvtg', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm">PVTG</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_minority"
                checked={formData.is_minority === 1}
                onChange={(e) => handleCheckboxChange('is_minority', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm">Minority</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_informal"
                checked={formData.is_informal === 1}
                onChange={(e) => handleCheckboxChange('is_informal', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm">Informal Sector</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Children (0-6 years)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="children_0_6"
            value={formData.children_0_6}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Children (6-14 years)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="children_6_14"
            value={formData.children_6_14}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Children in School
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="children_in_school"
            value={formData.children_in_school}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adults (16-59 years)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="adults_16_59"
            value={formData.adults_16_59}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adult Males (16-59)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="adult_males_16_59"
            value={formData.adult_males_16_59}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adult Females (16-59)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="adult_females_16_59"
            value={formData.adult_females_16_59}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Elderly (60+ years)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="elderly_60_plus"
            value={formData.elderly_60_plus}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Able-bodied Adults
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="able_bodied_adults"
            value={formData.able_bodied_adults}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Working Members
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="working_members"
            value={formData.working_members}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Literate Adults (25+)
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="literate_adults_above_25"
            value={formData.literate_adults_above_25}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–15"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Tractor className="h-5 w-5 text-primary-600" />
          Land & Agriculture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Land (acres)
            </label>
            <input
              type="text"
              inputMode="decimal"
              name="total_land_acres"
              value={decimalInputText.total_land_acres !== undefined
                ? decimalInputText.total_land_acres
                : formData.total_land_acres}
              onChange={handleNumericInput}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. 2.5 (max 999)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Irrigated Land (acres)
            </label>
            <input
              type="text"
              inputMode="decimal"
              name="irrigated_land_acres"
              value={decimalInputText.irrigated_land_acres !== undefined
                ? decimalInputText.irrigated_land_acres
                : formData.irrigated_land_acres}
              onChange={handleNumericInput}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. 1.25 (max 999)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Crop Seasons per Year
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="crop_seasons"
              value={formData.crop_seasons}
              onChange={handleNumericInput}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="0–4"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assets Owned</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_two_wheeler"
              checked={formData.owns_two_wheeler}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Motorized Two-wheeler</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_four_wheeler"
              checked={formData.owns_four_wheeler}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Four-wheeler/Car</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_tractor"
              checked={formData.owns_tractor}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Tractor/Harvester</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_mechanized_equipment"
              checked={formData.owns_mechanized_equipment}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Mechanized Equipment</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_refrigerator"
              checked={formData.owns_refrigerator}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Refrigerator</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_landline"
              checked={formData.owns_landline}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Landline Phone</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_tv"
              checked={formData.owns_tv}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Television</span>
          </label>

          <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              name="owns_mobile"
              checked={formData.owns_mobile}
              onChange={handleChange}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Mobile Phone</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            House Type
          </label>
          <select
            name="house_type"
            value={formData.house_type}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="houseless">Houseless</option>
            <option value="temporary_plastic">Temporary/Plastic</option>
            <option value="kucha">Kucha</option>
            <option value="semi_pucca">Semi-Pucca</option>
            <option value="pucca">Pucca</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Rooms
          </label>
          <input
            type="text"
            inputMode="numeric"
            name="num_rooms"
            value={formData.num_rooms}
            onChange={handleNumericInput}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0–20"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-3">Basic Amenities</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_electricity"
                checked={formData.has_electricity === 1}
                onChange={(e) => handleCheckboxChange('has_electricity', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <Zap className="h-5 w-5 text-yellow-500" />
              <span className="text-sm font-medium">Electricity Connection</span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_water_tap"
                checked={formData.has_water_tap === 1}
                onChange={(e) => handleCheckboxChange('has_water_tap', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm font-medium">Water Tap Connection</span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_toilet"
                checked={formData.has_toilet === 1}
                onChange={(e) => handleCheckboxChange('has_toilet', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm font-medium">Toilet Facility</span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="is_houseless"
                checked={formData.is_houseless === 1}
                onChange={(e) => handleCheckboxChange('is_houseless', e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm font-medium">No Shelter</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-3">Financial Access</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_bank_account"
                checked={formData.has_bank_account}
                onChange={handleChange}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <Landmark className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">Bank Account</span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_savings"
                checked={formData.has_savings}
                onChange={handleChange}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium">Has Savings</span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="has_loan"
                checked={formData.has_loan}
                onChange={handleChange}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium">Active Loan</span>
            </label>
          </div>
        </div>

        {formData.has_loan && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Loan Source
            </label>
            <select
              name="loan_source"
              value={formData.loan_source}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="none">None</option>
              <option value="bank">Bank</option>
              <option value="cooperative">Cooperative</option>
              <option value="moneylender">Moneylender</option>
              <option value="family">Family/Friends</option>
              <option value="other">Other</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );

  if (isCheckingStatus) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Spinner className="h-12 w-12 mx-auto mb-4" />
          <p className="text-gray-600">Checking survey status...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ClassificationResultModal
        isOpen={showClassificationResult}
        onClose={handleClassificationClose}
        result={classificationResult}
        onContinue={handleClassificationContinue}
      />
      
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary-600" />
              Family Survey
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Please fill out this survey to register your family information. This data will be used for welfare benefit eligibility and APL/BPL classification.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              {renderStepIndicator()}

              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
              {currentStep === 5 && renderStep5()}

              {errors.submit && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <p className="text-sm text-red-600">{errors.submit}</p>
                </div>
              )}

              <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 1 || isSubmitting}
                >
                  Back
                </Button>

                <div className="text-sm text-gray-600">
                  Step {currentStep} of 5
                </div>

                {currentStep < 5 ? (
                  <Button type="button" onClick={handleNext} disabled={isSubmitting}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Processing...
                      </>
                    ) : (
                      'Submit & Get Classification'
                    )}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default FamilySurvey;
