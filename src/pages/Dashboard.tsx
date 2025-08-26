// src/pages/Dashboard.tsx - SIMPLIFIED VERSION
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from "@/components/Navbar";
import { TemplateCard } from "@/components/TemplateCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiCall } from '@/config/api';

import { 
  ShoppingBag, 
  Download, 
  Star, 
  TrendingUp, 
  Brain,
  BarChart3,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check if this is a post-Stripe redirect
  const isStripeReturn = searchParams.get('purchase') === 'success';
  const templateId = searchParams.get('template');

  // Authentication and data state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [purchasedTemplates, setPurchasedTemplates] = useState([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);

  // Pagination state
  const TEMPLATES_PER_PAGE = 6;
  const RECOMMENDATIONS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState(1);
  const [currentRecommendationPage, setCurrentRecommendationPage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");

  // Simplified authentication check
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // If coming from Stripe, wait a moment for session to stabilize
        if (isStripeReturn) {
          console.log('Post-Stripe redirect detected, waiting for session...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }

        // FIXED: Use apiCall instead of raw fetch and correct endpoint
        const response = await apiCall('/api/auth/profile/session');

        if (response.ok) {
          setIsAuthenticated(true);
          
          // Show success message for Stripe returns
          if (isStripeReturn) {
            toast.success('Purchase completed successfully! Welcome to your dashboard.');
            
            // Clean up URL parameters
           const newUrl = new URL(window.location);
           newUrl.searchParams.delete('purchase');
           newUrl.searchParams.delete('template');
           window.history.replaceState({}, '', newUrl.toString());
         }
       } else {
         // FIXED: Use absolute URL for GitHub OAuth redirect
         if (!isStripeReturn) {
           window.location.href = 'https://www.devhubconnect.com/auth/github';
           return;
         }
          
          // For Stripe returns, try one more time after another delay
          console.log('First auth check failed for Stripe return, trying again...');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 more seconds
          
          // FIXED: Use apiCall for retry attempt
          const retryResponse = await apiCall('/api/auth/profile/session');
          
          if (retryResponse.ok) {
            setIsAuthenticated(true);
            toast.success('Purchase completed! Welcome to your dashboard.');
          } else {
            console.log('Auth failed after Stripe - redirecting to GitHub');
            toast.error('Session expired during checkout. Please sign in again.');
            // FIXED: Use absolute URL for GitHub OAuth redirect
            window.location.href = 'https://www.devhubconnect.com/auth/github';
            return;
          }
        }
      } catch (error) {
        console.error('Authentication verification failed:', error);
        
        if (isStripeReturn) {
          toast.error('Authentication failed after purchase. Please sign in again.');
        }
        
        // FIXED: Use absolute URL for GitHub OAuth redirect
        window.location.href = 'https://www.devhubconnect.com/auth/github';
      } finally {
        setAuthLoading(false);
      }
    };
    
    verifyAuth();
  }, [isStripeReturn]);

  // Fetch user's purchased templates
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchPurchases = async () => {
      try {
        // FIXED: Use apiCall instead of raw fetch
        const response = await apiCall('/api/user/purchases');
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.purchases) {
            const formattedTemplates = data.purchases.map(purchase => ({
              ...purchase.template,
              purchased: true,
              amountPaid: purchase.purchaseInfo?.amountPaid || purchase.template?.price || 0,
              purchasedAt: purchase.purchaseInfo?.purchasedAt,
              status: purchase.purchaseInfo?.status || 'completed'
            }));
            
            setPurchasedTemplates(formattedTemplates);
          }
        } else {
          console.error('Failed to fetch purchases:', response.status);
        }
      } catch (error) {
        console.error('Error fetching purchases:', error);
        toast.error('Failed to load your templates.');
      } finally {
        setIsLoadingPurchases(false);
      }
    };

    fetchPurchases();
  }, [isAuthenticated]);

  // Fetch recommendations using your existing endpoint
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchRecommendations = async () => {
      try {
        // FIXED: Use apiCall instead of raw fetch
        const response = await apiCall('/api/recommendations?limit=12');
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.recommendations) {
            setRecommendations(data.recommendations);
          }
        } else {
          console.error('Failed to fetch recommendations:', response.status);
        }
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      } finally {
        setIsLoadingRecommendations(false);
      }
    };

    fetchRecommendations();
  }, [isAuthenticated]);

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isStripeReturn ? 'Completing your purchase...' : 'Loading dashboard...'}
          </p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Calculate pagination
  const totalPages = Math.ceil(purchasedTemplates.length / TEMPLATES_PER_PAGE);
  const paginatedTemplates = purchasedTemplates.slice(
    (currentPage - 1) * TEMPLATES_PER_PAGE,
    currentPage * TEMPLATES_PER_PAGE
  );

  const totalRecommendationPages = Math.ceil(recommendations.length / RECOMMENDATIONS_PER_PAGE);
  const paginatedRecommendations = recommendations.slice(
    (currentRecommendationPage - 1) * RECOMMENDATIONS_PER_PAGE,
    currentRecommendationPage * RECOMMENDATIONS_PER_PAGE
  );

  // Calculate stats
  const totalSpent = purchasedTemplates.reduce((sum, template) => {
    return sum + (template.amountPaid || 0);
  }, 0);

  // Pagination functions
  const goToPage = (page: number) => {
    setCurrentPage(page);
    document.getElementById('my-templates')?.scrollIntoView({ behavior: 'smooth' });
  };

  const goToRecommendationPage = (page: number) => {
    setCurrentRecommendationPage(page);
    document.getElementById('recommendations-grid')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Template removal handler
  const handleTemplateRemoved = (removedTemplateId: number) => {
    setPurchasedTemplates(prev => 
      prev.filter(template => template.id !== removedTemplateId)
    );
    
    const newCount = purchasedTemplates.length - 1;
    toast.success(`Template removed! ${newCount} templates remaining`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Dashboard</h1>
          <p className="text-gray-600">Manage your automation templates and discover new ones</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
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
                  <p className="text-xs text-muted-foreground">Your collection</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${(totalSpent / 100).toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Lifetime value</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recommendations.length}</div>
                  <p className="text-xs text-muted-foreground">Available for you</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
                  <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">4.8</div>
                  <p className="text-xs text-muted-foreground">Community score</p>
                </CardContent>
              </Card>
            </div>

            {/* My Templates Section */}
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
                <Link to="/">
                  <Button variant="outline">Browse More Templates</Button>
                </Link>
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
                    <TemplateCard 
                      key={template.id} 
                      template={template} 
                      onTemplateRemoved={handleTemplateRemoved}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-600">
                    <div className="mb-4">No templates purchased yet. Browse our collection to get started!</div>
                    <Link to="/">
                      <Button variant="outline">Browse Templates</Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Pagination for My Templates */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Recommendations Preview */}
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
                {isLoadingRecommendations ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-gray-200 rounded mb-4"></div>
                        <div className="h-20 bg-gray-200 rounded mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </CardContent>
                    </Card>
                  ))
                ) : recommendations.length > 0 ? (
                  recommendations.slice(0, 3).map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-600">
                    <div>No recommendations available at the moment.</div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                  <Brain className="h-6 w-6 text-blue-600" />
                  <span>Recommendations</span>
                </h2>
                <p className="text-gray-600 mt-1">Templates we think you'll love</p>
              </div>
              
              <Link to="/">
                <Button variant="outline">Browse All</Button>
              </Link>
            </div>

            <div id="recommendations-grid">
              {paginatedRecommendations.length > 0 && (
                <div className="flex justify-between items-center mb-6">
                  <p className="text-sm text-gray-600">
                    Showing {((currentRecommendationPage - 1) * RECOMMENDATIONS_PER_PAGE) + 1}-{Math.min(currentRecommendationPage * RECOMMENDATIONS_PER_PAGE, recommendations.length)} of {recommendations.length} recommendations
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoadingRecommendations ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <Card key={index} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-gray-200 rounded mb-4"></div>
                        <div className="h-32 bg-gray-200 rounded mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      </CardContent>
                    </Card>
                  ))
                ) : paginatedRecommendations.length > 0 ? (
                  paginatedRecommendations.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No recommendations found
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Check back later for personalized recommendations
                    </p>
                    <Link to="/">
                      <Button>Browse All Templates</Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Pagination for Recommendations */}
              {totalRecommendationPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentRecommendationPage(Math.max(1, currentRecommendationPage - 1))}
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
                    onClick={() => setCurrentRecommendationPage(Math.min(totalRecommendationPages, currentRecommendationPage + 1))}
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
              <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Purchase History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Total Templates</span>
                      <span className="font-medium">{purchasedTemplates.length}</span>
                    </div>
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
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Available</span>
                      <span className="font-medium">{recommendations.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">System</span>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Account Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Authentication</span>
                      <Badge variant="default">GitHub OAuth</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Session</span>
                      <Badge variant="default">Active</Badge>
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