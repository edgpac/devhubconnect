import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Users, DollarSign, Eye, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AnalyticsData {
  popularByDownloads: any[];
  popularByPurchases: any[];
  categoryStats: any[];
  topSearchTerms: any[];
  revenueStats: {
    totalRevenue: number;
    totalSales: number;
    avgOrderValue: number;
  };
  userStats: {
    totalUsers: number;
    activeUsers: number;
  };
}

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is admin before loading analytics
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      // Verify admin status by trying to fetch analytics
      const response = await fetch('/api/admin/analytics-data', {
        credentials: 'include'
      });

      if (response.status === 403) {
        setError('Admin privileges required to view analytics');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to verify admin status');
      }

      setIsAdmin(true);
      fetchAnalytics();
    } catch (err) {
      setError('Failed to verify admin access');
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/analytics-data', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const data = await response.json();
      setAnalytics(data.data);
    } catch (err) {
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
              <p className="text-sm mb-4">{error || 'Admin privileges required'}</p>
              <button 
                onClick={() => navigate('/admin')}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Return to Admin Login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-red-600">No analytics data available</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-gray-600">Overview of marketplace performance and user behavior</p>
        </div>
        <Button 
          onClick={() => navigate('/admin/dashboard')}
          variant="outline"
          className="flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Admin
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold">${(analytics.revenueStats.totalRevenue / 100).toFixed(2)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold">{analytics.revenueStats.totalSales}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-2xl font-bold">{analytics.userStats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-2xl font-bold">{analytics.userStats.activeUsers}</p>
              </div>
              <Eye className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Search Terms - This is the key insight! */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="w-5 h-5 mr-2" />
              Top Search Terms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topSearchTerms && analytics.topSearchTerms.length > 0 ? (
                analytics.topSearchTerms.map((term, index) => (
                  <div key={index} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                    <div>
                      <p className="font-medium">{term.searchTerm}</p>
                      <p className="text-sm text-gray-600">Search term</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{term.searchCount}</p>
                      <p className="text-sm text-gray-600">searches</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No search data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Most Downloaded Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.popularByDownloads.slice(0, 5).map((template, index) => (
                <div key={template.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                  <div>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-gray-600">${(template.price / 100).toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{template.downloadCount} downloads</p>
                    <p className="text-sm text-gray-600">{template.viewCount} views</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue and Category Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              Top Revenue Generators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.popularByPurchases.slice(0, 5).map((template, index) => (
                <div key={template.templateId} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                  <div>
                    <p className="font-medium">{template.templateName}</p>
                    <p className="text-sm text-gray-600">{template.category || 'General'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{template.purchaseCount} sales</p>
                    <p className="text-sm text-gray-600">${(template.totalRevenue / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Category Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.categoryStats.map((category, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium capitalize">{category.category || 'Uncategorized'}</p>
                    <p className="text-sm text-gray-600">{category.templateCount} templates</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{category.totalDownloads} downloads</p>
                    <p className="text-sm text-gray-600">Avg rating: {category.avgRating ? Number(category.avgRating).toFixed(1) : 'N/A'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights Box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">💡 Key Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700">
            <p className="mb-2">
              <strong>Search Terms</strong> show you what workflows users want but can't find - create templates for popular search terms!
            </p>
            <p className="mb-2">
              <strong>Download vs Views</strong> ratio shows conversion rates - low ratios may indicate pricing or quality issues.
            </p>
            <p>
              <strong>Category Performance</strong> helps you identify which workflow types to focus on for maximum impact.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}