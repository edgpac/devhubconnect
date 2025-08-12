import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Filter, X } from "lucide-react";

interface RecommendationFiltersProps {
  onFiltersChange: (filters: RecommendationFilters) => void;
  className?: string;
}

interface RecommendationFilters {
  categories?: string[];
  maxPrice?: number;
  minRating?: number;
  sortBy?: 'recommended' | 'price_low' | 'price_high' | 'rating' | 'newest' | 'popular';
  includePersonalized?: boolean;
}

const filterCategories = [
  "automation", "integration", "analytics", "communication", "productivity",
  "sales", "marketing", "customer_support", "data_processing", "workflow"
];

export const RecommendationFilters = ({ onFiltersChange, className = "" }: RecommendationFiltersProps) => {
  const [filters, setFilters] = useState<RecommendationFilters>({
    maxPrice: 10000, // $100 default
    minRating: 0,
    sortBy: 'recommended',
    includePersonalized: true,
    categories: [],
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const applyFilters = () => {
    onFiltersChange(filters);
    setIsExpanded(false);
  };

  const clearFilters = () => {
    const defaultFilters: RecommendationFilters = {
      maxPrice: 10000,
      minRating: 0,
      sortBy: 'recommended',
      includePersonalized: true,
      categories: [],
    };
    setFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  };

  const toggleCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories?.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...(prev.categories || []), category]
    }));
  };

  const activeFiltersCount = 
    (filters.categories?.length || 0) +
    (filters.maxPrice !== 10000 ? 1 : 0) +
    (filters.minRating !== 0 ? 1 : 0) +
    (filters.sortBy !== 'recommended' ? 1 : 0);

  if (!isExpanded) {
    return (
      <Card className={`hover:shadow-md transition-shadow ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Filter className="h-5 w-5 text-gray-600" />
              <div>
                <h3 className="font-medium">Filters</h3>
                <p className="text-sm text-gray-600">
                  {activeFiltersCount > 0 ? `${activeFiltersCount} active filters` : 'Refine your search'}
                </p>
              </div>
            </div>
            <Button onClick={() => setIsExpanded(true)} variant="outline" size="sm">
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="mr-2 h-5 w-5 rounded-full p-0 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-blue-600" />
            <span>Filter Recommendations</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Sort By */}
        <div className="space-y-2">
          <Label>Sort By</Label>
          <Select 
            value={filters.sortBy} 
            onValueChange={(value) => setFilters(prev => ({ 
              ...prev, 
              sortBy: value as RecommendationFilters['sortBy'] 
            }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recommended for You</SelectItem>
              <SelectItem value="popular">Most Popular</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="price_low">Price: Low to High</SelectItem>
              <SelectItem value="price_high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Price Range */}
        <div className="space-y-3">
          <Label>Max Price: ${(filters.maxPrice! / 100).toFixed(2)}</Label>
          <Slider
            value={[filters.maxPrice!]}
            onValueChange={([value]) => setFilters(prev => ({ ...prev, maxPrice: value }))}
            min={0}
            max={25000}
            step={500}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Free</span>
            <span>$250+</span>
          </div>
        </div>

        {/* Minimum Rating */}
        <div className="space-y-2">
          <Label>Minimum Rating</Label>
          <Select 
            value={filters.minRating?.toString()} 
            onValueChange={(value) => setFilters(prev => ({ ...prev, minRating: Number(value) }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any Rating</SelectItem>
              <SelectItem value="3">3+ Stars</SelectItem>
              <SelectItem value="4">4+ Stars</SelectItem>
              <SelectItem value="4.5">4.5+ Stars</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Categories */}
        <div className="space-y-3">
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2">
            {filterCategories.map(category => (
              <Badge
                key={category}
                variant={filters.categories?.includes(category) ? "default" : "outline"}
                className="cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => toggleCategory(category)}
              >
                {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Badge>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4 border-t">
          <Button onClick={applyFilters} className="flex-1">
            Apply Filters
          </Button>
          <Button variant="outline" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};