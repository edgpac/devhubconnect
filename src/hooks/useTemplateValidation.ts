// src/hooks/useTemplateValidation.ts
import { useState, useCallback } from 'react';
import DHCTemplateValidator, { ValidationResult } from '../services/dhcValidator';

interface UseTemplateValidationReturn {
  validateTemplate: (file: File) => Promise<ValidationResult>;
  clearValidation: () => void;
  isValidating: boolean;
  validationError: string | null;
  validatedTemplate: ValidationResult | null;
  isValid: boolean;
}

export const useTemplateValidation = (): UseTemplateValidationReturn => {
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatedTemplate, setValidatedTemplate] = useState<ValidationResult | null>(null);
  
  const validator = new DHCTemplateValidator();
  
  const validateTemplate = useCallback(async (file: File): Promise<ValidationResult> => {
    setIsValidating(true);
    setValidationError(null);
    setValidatedTemplate(null);
    
    try {
      const validation = await validator.handleFileUpload(file);
      setValidatedTemplate(validation);
      return validation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setValidationError(errorMessage);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, []);
  
  const clearValidation = useCallback(() => {
    setValidationError(null);
    setValidatedTemplate(null);
  }, []);
  
  return {
    validateTemplate,
    clearValidation,
    isValidating,
    validationError,
    validatedTemplate,
    isValid: !!validatedTemplate
  };
};
