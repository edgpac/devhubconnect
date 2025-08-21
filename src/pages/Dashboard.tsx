// src/pages/Dashboard.tsx - FIXED VERSION
import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { TemplateCard } from "@/components/TemplateCard";
import { BusinessPlanForm } from "@/components/BusinessPlanForm";
import { RecommendationFilters } from "@/components/RecommendationFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEnhancedRecommendations } from "@/hooks/useEnhancedRecommendations";

import { 
 ShoppingBag, 
 Download, 
 Star, 
 TrendingUp, 
 Brain,
 Filter,
 Settings,
 BarChart3,
 Sparkles,
 Target,
 Zap,
 ChevronLeft,
 ChevronRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// Mock current user - replace with your auth context
const CURRENT_USER_ID = "user_123"; // Get this from your auth context

export const Dashboard = () => {
 const [activeTab, setActiveTab] = useState("overview");
 const [showBusinessPlan, setShowBusinessPlan] = useState(false);
 const [showFilters, setShowFilters] = useState(false);

 // Pagination state for My Templates
 const TEMPLATES_PER_PAGE = 6;
 const [currentPage, setCurrentPage] = useState(1);

 // Pagination state for Recommendations
 const RECOMMENDATIONS_PER_PAGE = 6;
 const [currentRecommendationPage, setCurrentRecommendationPage] = useState(1);

 // Enhanced recommendations hook
 const {
   recommendations,
   metadata,
   isLoading,
   error,
   filters,
   preferences,
   updateFilters,
   updatePreferences,
   refetch,
 } = useEnhancedRecommendations(CURRENT_USER_ID);

 // Real user's purchased templates (fetch from API)
 const [purchasedTemplates, setPurchasedTemplates] = useState([]);
 const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);

 useEffect(() => {
   const fetchPurchases = async () => {
     try {
       // ✅ FIXED: Use correct API endpoint that matches server endpoint list
       const response = await fetch('/api/user/purchases', {
         method: 'GET',
         credentials: 'include',
         headers: {
           'Content-Type': 'application/json',
         },
       });
       
       if (response.ok) {
         const data = await response.json();
         console.log('🐛 DEBUG: Raw API response:', data);
         
         if (data.success) {
           console.log('🐛 DEBUG: First purchase:', data.purchases[0]);
           
           // ✅ FIXED: Use the correct structure from your backend
           setPurchasedTemplates(data.purchases.map(purchase => {
             console.log('🐛 DEBUG: Processing purchase:', purchase);
             
             return {
               // ✅ Use template data directly from the structure
               ...purchase.template,
               // ✅ CRITICAL: Add the purchased flag that TemplateCard expects
               purchased: true,
               // ✅ Add purchase metadata
               purchaseInfo: purchase.purchaseInfo,
               purchasedAt: purchase.purchaseInfo?.purchasedAt,
               amountPaid: purchase.purchaseInfo?.amountPaid || purchase.template?.price || 0,
               status: purchase.purchaseInfo?.status || 'completed'
             };
           }));
         } else {
           console.error('❌ API returned success: false', data);
         }
       } else {
         console.error('❌ API response not ok:', response.status, response.statusText);
       }
     } catch (error) {
       console.error('❌ Error fetching purchases:', error);
       toast.error('Failed to load your templates. Please try refreshing the page.');
     } finally {
       setIsLoadingPurchases(false);
     }
   };

   fetchPurchases();
 }, []);

 // Calculate pagination for My Templates
 const totalPages = Math.ceil(purchasedTemplates.length / TEMPLATES_PER_PAGE);
 const paginatedTemplates = purchasedTemplates.slice(
   (currentPage - 1) * TEMPLATES_PER_PAGE,
   currentPage * TEMPLATES_PER_PAGE
 );

 // Calculate pagination for Recommendations
 const totalRecommendationPages = Math.ceil(recommendations.length / RECOMMENDATIONS_PER_PAGE);
 const paginatedRecommendations = recommendations.slice(
   (currentRecommendationPage - 1) * RECOMMENDATIONS_PER_PAGE,
   currentRecommendationPage * RECOMMENDATIONS_PER_PAGE
 );

 // Pagination functions for My Templates
 const goToPage = (page: number) => {
   setCurrentPage(page);
   document.getElementById('my-templates')?.scrollIntoView({ behavior: 'smooth' });
 };

 const goToPrevious = () => {
   if (currentPage > 1) {
     setCurrentPage(currentPage - 1);
   }
 };

 const goToNext = () => {
   if (currentPage < totalPages) {
     setCurrentPage(currentPage + 1);
   }
 };

 // Pagination functions for Recommendations
 const goToRecommendationPage = (page: number) => {
   setCurrentRecommendationPage(page);
   document.getElementById('recommendations-grid')?.scrollIntoView({ behavior: 'smooth' });
 };

 const goToRecommendationPrevious = () => {
   if (currentRecommendationPage > 1) {
     setCurrentRecommendationPage(currentRecommendationPage - 1);
   }
 };

 const goToRecommendationNext = () => {
   if (currentRecommendationPage < totalRecommendationPages) {
     setCurrentRecommendationPage(currentRecommendationPage + 1);
   }
 };

 console.log('🔍 DEBUG: Starting total calculation');
 console.log('🔍 DEBUG: purchasedTemplates array:', purchasedTemplates);
 console.log('🔍 DEBUG: purchasedTemplates length:', purchasedTemplates.length);

 if (purchasedTemplates.length > 0) {
   console.log('🔍 DEBUG: First template:', purchasedTemplates[0]);
 }

 // ✅ FIXED: Safe calculation with fallback values and debugging
 const totalSpent = purchasedTemplates.reduce((sum, template) => {
   console.log('💰 Processing template:', template.name || 'No name', 'ID:', template.id);
   
   // Check all possible sources for the amount
   const amount = template.amountPaid ||           
                 template.purchaseInfo?.amountPaid || 
                 template.price ||                    
                 0;
                 
   console.log('💰 Amount check for', template.name, ':', {
     amountPaid: template.amountPaid,
     purchaseInfoAmount: template.purchaseInfo?.amountPaid,
     templatePrice: template.price,
     usedAmount: amount
   });
   
   return sum + amount;
 }, 0);

 console.log('🔍 FINAL totalSpent:', totalSpent);
 console.log('🔍 FINAL totalSpent in dollars:', (totalSpent / 100).toFixed(2));

 const handlePreferencesUpdate = (newPreferences: any) => {
   updatePreferences(newPreferences);
   toast.success("Preferences updated! Refreshing recommendations...");
 };

 const handleFiltersChange = (newFilters: any) => {
   updateFilters(newFilters);
 };

 // Calculate recommendation insights
 const recommendationInsights = {
   personalized: metadata?.personalized || false,
   trendingBoost: metadata?.trending_boost_applied || false,
   filtersApplied: Object.keys(metadata?.filters_applied || {}).length,
   totalRecommendations: metadata?.total || 0,
 };

 // ✅ FUTURE DEBUG: Add retry function for failed purchases
 const retryFetchPurchases = () => {
   setIsLoadingPurchases(true);
   // Re-trigger the useEffect by updating a dependency
   window.location.reload();
 };

 return (
   <div className="min-h-screen bg-gray-50">
     <Navbar />
     
     <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
       {/* Header with Smart Insights */}
       <div className="mb-8">
         <div className="flex items-center justify-between mb-4">
           <div>
             <h1 className="text-3xl font-bold text-gray-900 mb-2">My Dashboard</h1>
             <p className="text-gray-600">AI-powered automation templates tailored for you</p>
           </div>
           
           {/* Smart Insights Badge */}
           {recommendationInsights.personalized && (
             <div className="flex items-center space-x-2">
               <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                 <Brain className="h-3 w-3 mr-1" />
                 AI Personalized
               </Badge>
               {recommendationInsights.trendingBoost && (
                 <Badge variant="secondary" className="bg-green-100 text-green-800">
                   <TrendingUp className="h-3 w-3 mr-1" />
                   Trending Boost
                 </Badge>
               )}
             </div>
           )}
         </div>

         {/* Quick Actions */}
         <div className="flex space-x-3">
           <Button
             variant="outline"
             size="sm"
             onClick={() => setShowBusinessPlan(!showBusinessPlan)}
             className="flex items-center space-x-2"
           >
             <Target className="h-4 w-4" />
             <span>Personalize</span>
           </Button>
           <Button
             variant="outline"
             size="sm"
             onClick={() => setShowFilters(!showFilters)}
             className="flex items-center space-x-2"
           >
             <Filter className="h-4 w-4" />
             <span>Filters</span>
             {recommendationInsights.filtersApplied > 0 && (
               <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                 {recommendationInsights.filtersApplied}
               </Badge>
             )}
           </Button>
           <Button
             variant="outline"
             size="sm"
             onClick={() => refetch()}
             className="flex items-center space-x-2"
           >
             <Sparkles className="h-4 w-4" />
             <span>Refresh</span>
           </Button>
         </div>
       </div>

       <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
         <TabsList className="grid w-full grid-cols-3">
           <TabsTrigger value="overview">Overview</TabsTrigger>
           <TabsTrigger value="recommendations">Smart Recommendations</TabsTrigger>
           <TabsTrigger value="analytics">Analytics</TabsTrigger>
         </TabsList>

         {/* Overview Tab */}
         <TabsContent value="overview" className="space-y-8">
           {/* Stats Cards */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Templates Purchased</CardTitle>
                 <ShoppingBag className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{purchasedTemplates.length}</div>
                 <p className="text-xs text-muted-foreground">+2 from last month</p>
               </CardContent>
             </Card>
             
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                 <TrendingUp className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">${(totalSpent / 100).toFixed(2)}</div>
                 <p className="text-xs text-muted-foreground">+$39.99 from last month</p>
               </CardContent>
             </Card>
             
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Smart Recommendations</CardTitle>
                 <Brain className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{recommendationInsights.totalRecommendations}</div>
                 <p className="text-xs text-muted-foreground">
                   {recommendationInsights.personalized ? 'Personalized for you' : 'General recommendations'}
                 </p>
               </CardContent>
             </Card>
             
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Avg Rating Given</CardTitle>
                 <Star className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">4.8</div>
                 <p className="text-xs text-muted-foreground">Based on 3 reviews</p>
               </CardContent>
             </Card>
           </div>

            {/* Business Plan & Filters */}
            {(showBusinessPlan || showFilters) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {showBusinessPlan && (
                  <BusinessPlanForm 
                    onPreferencesUpdate={handlePreferencesUpdate}
                  />
                )}
                {showFilters && (
                  <RecommendationFilters 
                    onFiltersChange={handleFiltersChange}
                  />
                )}
              </div>
            )}

            {/* My Templates with Pagination */}
            <div id="my-templates">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">My Templates</h2>
                  {purchasedTemplates.length > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      Showing {((currentPage - 1) * TEMPLATES_PER_PAGE) + 1}-{Math.min(currentPage * TEMPLATES_PER_PAGE, purchasedTemplates.length)} of {purchasedTemplates.length} templates
                    </p>
                  )}
                </div>
                <Button variant="outline">View All Purchases</Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoadingPurchases ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-gray-200 rounded mb-4"></div>
                        <div className="h-20 bg-gray-200 rounded mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </CardContent>
                    </Card>
                  ))
                ) : paginatedTemplates.length > 0 ? (
                  paginatedTemplates.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-600">
                    <div>No templates purchased yet. Browse our collection to get started!</div>
                    {/* ✅ FUTURE DEBUG: Add retry button for failed loads */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={retryFetchPurchases}
                      className="mt-4"
                    >
                      Retry Loading Templates
                    </Button>
                  </div>
                )}
              </div>

              {/* Pagination Controls for My Templates */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevious}
                    disabled={currentPage === 1}
                    className="flex items-center space-x-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(page)}
                        className="w-10 h-10 p-0"
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNext}
                    disabled={currentPage === totalPages}
                    className="flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Quick Recommendations Preview */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                  <span>Recommended for You</span>
                </h2>
                <Button onClick={() => setActiveTab("recommendations")} variant="outline">
                  View All Recommendations
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-gray-200 rounded mb-4"></div>
                        <div className="h-20 bg-gray-200 rounded mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </CardContent>
                    </Card>
                  ))
                ) : error ? (
                  <div className="col-span-full text-center py-8 text-red-500">
                    Error loading recommendations: {(error as Error).message}
                  </div>
                ) : recommendations.length > 0 ? (
                  recommendations.slice(0, 3).map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-600">
                    No recommendations available. Try updating your preferences!
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Smart Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-6">
            {/* Recommendation Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                  <Brain className="h-6 w-6 text-blue-600" />
                  <span>Smart Recommendations</span>
                </h2>
                <p className="text-gray-600 mt-1">
                  AI-powered suggestions based on your preferences and behavior
                </p>
              </div>
              
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBusinessPlan(!showBusinessPlan)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Setup
                </Button>
                <Link to="/">
                  <Button variant="outline">Browse All</Button>
                </Link>
              </div>
            </div>

            {/* Recommendation Insights */}
            {metadata && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">
                          {metadata.total} templates found
                        </span>
                      </div>
                      {metadata.personalized && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          Personalized
                        </Badge>
                      )}
                      {metadata.trending_boost_applied && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Trending Boost
                        </Badge>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      Updated {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Business Plan & Filters */}
            {(showBusinessPlan || showFilters) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {showBusinessPlan && (
                  <BusinessPlanForm 
                    onPreferencesUpdate={handlePreferencesUpdate}
                  />
                )}
                {showFilters && (
                  <RecommendationFilters 
                    onFiltersChange={handleFiltersChange}
                  />
                )}
              </div>
            )}

            {/* Recommendations Grid with Pagination */}
            <div id="recommendations-grid">
              {paginatedRecommendations.length > 0 && (
                <div className="flex justify-between items-center mb-6">
                  <p className="text-sm text-gray-600">
                    Showing {((currentRecommendationPage - 1) * RECOMMENDATIONS_PER_PAGE) + 1}-{Math.min(currentRecommendationPage * RECOMMENDATIONS_PER_PAGE, recommendations.length)} of {recommendations.length} recommendations
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                  Array.from({ length: 9 }).map((_, index) => (
                    <Card key={index} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-gray-200 rounded mb-4"></div>
                        <div className="h-32 bg-gray-200 rounded mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      </CardContent>
                    </Card>
                  ))
                ) : error ? (
                  <div className="col-span-full text-center py-12">
                    <div className="text-red-500 mb-4">Error loading recommendations</div>
                    <Button onClick={() => refetch()} variant="outline">
                      Try Again
                    </Button>
                  </div>
                ) : paginatedRecommendations.length > 0 ? (
                  paginatedRecommendations.map((template, index) => (
                    <div key={template.id} className="relative">
                      <TemplateCard template={template} />
                      {/* Recommendation Score Badge (dev only) */}
                      {template._recommendationScore && process.env.NODE_ENV === 'development' && (
                        <Badge 
                          variant="secondary" 
                          className="absolute top-2 right-2 bg-purple-100 text-purple-800 text-xs"
                        >
                          Score: {template._recommendationScore.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No recommendations found
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Try adjusting your filters or setting up your business preferences
                    </p>
                    <Button onClick={() => setShowBusinessPlan(true)}>
                      Setup Preferences
                    </Button>
                  </div>
                )}
              </div>

              {/* Pagination Controls for Recommendations */}
              {totalRecommendationPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToRecommendationPrevious}
                    disabled={currentRecommendationPage === 1}
                    className="flex items-center space-x-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalRecommendationPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentRecommendationPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToRecommendationPage(page)}
                        className="w-10 h-10 p-0"
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToRecommendationNext}
                    disabled={currentRecommendationPage === totalRecommendationPages}
                    className="flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="flex items-center space-x-2 mb-6">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">Recommendation Analytics</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Preference Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Your Interests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {preferences.preferredCategories?.slice(0, 5).map(category => (
                      <div key={category} className="flex justify-between">
                        <span className="text-sm">{category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        <Badge variant="outline">{Math.floor(Math.random() * 10) + 1}</Badge>
                      </div>
                    )) || <p className="text-gray-600 text-sm">Set up preferences to see insights</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Recommendation Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recommendation Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Personalization</span>
                      <Badge variant={recommendationInsights.personalized ? "default" : "secondary"}>
                        {recommendationInsights.personalized ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Trending Boost</span>
                      <Badge variant={recommendationInsights.trendingBoost ? "default" : "secondary"}>
                        {recommendationInsights.trendingBoost ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Active Filters</span>
                      <Badge variant="outline">{recommendationInsights.filtersApplied}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Spending Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Spending Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Total Spent</span>
                      <span className="font-medium">${(totalSpent / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Avg per Template</span>
                      <span className="font-medium">
                        ${purchasedTemplates.length > 0 ? (totalSpent / purchasedTemplates.length / 100).toFixed(2) : '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Budget Range</span>
                      <span className="font-medium">
                        ${(preferences.maxPrice || 5000) / 100}/template
                     </span>
                   </div>
                 </div>
               </CardContent>
             </Card>
           </div>
         </TabsContent>
       </Tabs>
     </div>
   </div>
 );
};