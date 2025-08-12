import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Target, Zap } from "lucide-react";
import { toast } from "sonner";

interface BusinessPlanFormProps {
  onPreferencesUpdate: (preferences: UserPreferences) => void;
  className?: string;
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

const businessTypes = [
  "startup", "small_business", "enterprise", "agency", "freelancer", "consultant"
];

const industries = [
  "technology", "healthcare", "finance", "education", "retail", "manufacturing",
  "real_estate", "marketing", "consulting", "e_commerce", "saas", "other"
];

const availableCategories = [
  "automation", "integration", "analytics", "communication", "productivity",
  "sales", "marketing", "customer_support", "data_processing", "workflow"
];

const commonWorkflows = [
  "lead_generation", "customer_onboarding", "email_marketing", "data_sync",
  "report_generation", "task_automation", "notification_systems", "content_management"
];

const popularIntegrations = [
  "gmail", "slack", "stripe", "notion", "github", "trello", "shopify",
  "google_sheets", "discord", "webhook", "database", "api"
];

export const BusinessPlanForm = ({ onPreferencesUpdate, className = "" }: BusinessPlanFormProps) => {
  const [preferences, setPreferences] = useState<UserPreferences>({
    maxPrice: 5000, // Default $50.00 (in cents)
    preferredCategories: [],
    workflows: [],
    integrations: [],
  });

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load saved preferences from localStorage
    const saved = localStorage.getItem('user_preferences');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Error loading saved preferences:', error);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Save to localStorage for persistence
      localStorage.setItem('user_preferences', JSON.stringify(preferences));
      
      // Call parent callback
      onPreferencesUpdate(preferences);
      
      toast.success("Preferences saved! Recommendations will be updated.", {
        description: "We'll use these preferences to personalize your recommendations."
      });
      
      setIsExpanded(false);
    } catch (error) {
      toast.error("Failed to save preferences");
    }
  };

  const toggleCategory = (category: string) => {
    setPreferences(prev => ({
      ...prev,
      preferredCategories: prev.preferredCategories?.includes(category)
        ? prev.preferredCategories.filter(c => c !== category)
        : [...(prev.preferredCategories || []), category]
    }));
  };

  const toggleWorkflow = (workflow: string) => {
    setPreferences(prev => ({
      ...prev,
      workflows: prev.workflows?.includes(workflow)
        ? prev.workflows.filter(w => w !== workflow)
        : [...(prev.workflows || []), workflow]
    }));
  };

  const toggleIntegration = (integration: string) => {
    setPreferences(prev => ({
      ...prev,
      integrations: prev.integrations?.includes(integration)
        ? prev.integrations.filter(i => i !== integration)
        : [...(prev.integrations || []), integration]
    }));
  };

  if (!isExpanded) {
    return (
      <Card className={`hover:shadow-md transition-shadow ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Target className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-medium">Personalize Recommendations</h3>
                <p className="text-sm text-gray-600">Tell us about your business to get better suggestions</p>
              </div>
            </div>
            <Button onClick={() => setIsExpanded(true)} variant="outline" size="sm">
              Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <span>Business Preferences</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Type & Team Size */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type</Label>
              <Select 
                value={preferences.businessType} 
                onValueChange={(value) => setPreferences(prev => ({ ...prev, businessType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamSize" className="flex items-center space-x-1">
                <Users className="h-4 w-4" />
                <span>Team Size</span>
              </Label>
              <Input
                type="number"
                id="teamSize"
                min="1"
                max="1000"
                value={preferences.teamSize || ''}
                onChange={(e) => setPreferences(prev => ({ 
                  ...prev, 
                  teamSize: e.target.value ? Number(e.target.value) : undefined 
                }))}
                placeholder="e.g., 5"
              />
            </div>
          </div>

          {/* Industry & Budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select 
                value={preferences.industry} 
                onValueChange={(value) => setPreferences(prev => ({ ...prev, industry: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map(industry => (
                    <SelectItem key={industry} value={industry}>
                      {industry.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPrice">Max Budget per Template</Label>
              <Select 
                value={preferences.maxPrice?.toString()} 
                onValueChange={(value) => setPreferences(prev => ({ ...prev, maxPrice: Number(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select budget" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">Up to $10</SelectItem>
                  <SelectItem value="2500">Up to $25</SelectItem>
                  <SelectItem value="5000">Up to $50</SelectItem>
                  <SelectItem value="10000">Up to $100</SelectItem>
                  <SelectItem value="25000">Up to $250</SelectItem>
                  <SelectItem value="999999">No limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preferred Categories */}
          <div className="space-y-3">
            <Label className="flex items-center space-x-1">
              <Zap className="h-4 w-4" />
              <span>Interested Categories</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {availableCategories.map(category => (
                <Badge
                  key={category}
                  variant={preferences.preferredCategories?.includes(category) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              ))}
            </div>
          </div>

          {/* Common Workflows */}
          <div className="space-y-3">
            <Label>Common Workflows</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {commonWorkflows.map(workflow => (
                <div key={workflow} className="flex items-center space-x-2">
                  <Checkbox
                    checked={preferences.workflows?.includes(workflow)}
                    onCheckedChange={() => toggleWorkflow(workflow)}
                  />
                  <label className="text-sm cursor-pointer">
                    {workflow.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Popular Integrations */}
          <div className="space-y-3">
            <Label>Tools & Integrations You Use</Label>
            <div className="flex flex-wrap gap-2">
              {popularIntegrations.map(integration => (
                <Badge
                  key={integration}
                  variant={preferences.integrations?.includes(integration) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => toggleIntegration(integration)}
                >
                  {integration.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button type="submit" className="flex-1">
              Save Preferences
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsExpanded(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};