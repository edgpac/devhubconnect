import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';

interface RecommendationFilters {
  categories?: string[];
  maxPrice?: number;
  minRating?: number;
  sortBy?: string;
  includePersonalized?: boolean;
}

interface UserPreferences {
  businessType?: string;
  teamSize?: number;
  industry?: string;
  maxPrice?: number;
  preferredCategories?: string[];
  workflows?: string[];
  integrations?: string[];
}

export const useEnhancedRecommendations = (userId?: string) => {
  const [filters, setFilters] = useState<RecommendationFilters>({
    maxPrice: 10000,
    minRating: 0,
    includePersonalized: true,
  });

  const [preferences, setPreferences] = useState<UserPreferences>({});

  // Build query params
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    
    if (userId) params.append('userId', userId);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.toString());
    if (filters.minRating) params.append('minRating', filters.minRating.toString());
    if (filters.includePersonalized !== undefined) {
      params.append('includePersonalized', filters.includePersonalized.toString());
    }
    if (filters.categories?.length) {
      filters.categories.forEach(cat => params.append('categories', cat));
    }

    return params.toString();
  }, [userId, filters]);

  // Fetch recommendations
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['enhanced-recommendations', userId, filters],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const response = await fetch(`http://localhost:3000/api/recommendations?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const updateFilters = useCallback((newFilters: Partial<RecommendationFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const updatePreferences = useCallback(async (newPreferences: UserPreferences) => {
    setPreferences(newPreferences);
    
    // Save preferences to backend if user is logged in
    if (userId) {
      try {
        await fetch('/api/recommendations/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, preferences: newPreferences }),
        });
      } catch (error) {
        console.error('Failed to save preferences:', error);
      }
    }
    
    // Trigger refetch with new preferences
    refetch();
  }, [userId, refetch]);

  return {
    recommendations: data?.recommendations || [],
    metadata: data?.metadata,
    isLoading,
    error,
    filters,
    preferences,
    updateFilters,
    updatePreferences,
    refetch,
  };
};