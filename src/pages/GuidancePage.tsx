import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  User, 
  CreditCard, 
  Download,
  Eye,
  MousePointer,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";
import { Link } from "react-router-dom";

export const GuidancePage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Header */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold mb-4">
            How to Use DevHubConnect
          </h1>
          <p className="text-xl text-blue-100">
            Your complete guide to discovering, purchasing, and using automation templates
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Quick Start */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="w-6 h-6 mr-2 text-green-600" />
                Quick Start Guide
              </CardTitle>
              <CardDescription>
                Get started in 3 simple steps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-blue-600 font-bold text-lg">1</span>
                  </div>
                  <h3 className="font-semibold mb-2">Browse Templates</h3>
                  <p className="text-sm text-gray-600">Explore our collection of automation templates on the homepage</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-purple-600 font-bold text-lg">2</span>
                  </div>
                  <h3 className="font-semibold mb-2">Preview & Purchase</h3>
                  <p className="text-sm text-gray-600">Click on templates to see detailed previews, then purchase securely</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-600 font-bold text-lg">3</span>
                  </div>
                  <h3 className="font-semibold mb-2">Access & Use</h3>
                  <p className="text-sm text-gray-600">View your purchased templates in your personal dashboard</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Browsing Templates */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="w-6 h-6 mr-2 text-blue-600" />
                Browsing & Finding Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <MousePointer className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Homepage Navigation</h4>
                  <p className="text-gray-600">The homepage displays all available templates in a clean grid layout. Each template card shows the name, description, price, and app icons.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Search className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Search Function</h4>
                  <p className="text-gray-600">Use the search bar at the top to find templates by name or description. Type keywords related to what you're looking for.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Filter className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Category Filters</h4>
                  <p className="text-gray-600">Click on category badges (email, database, webhooks, etc.) to filter templates by type. Click "all" to reset filters.</p>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <Info className="w-5 h-5 mr-2 text-blue-600" />
                  <span className="font-semibold text-blue-900">Pro Tip</span>
                </div>
                <p className="text-blue-800">Look for the app icons on each template card to quickly identify which services the automation works with (Gmail, Slack, Stripe, etc.).</p>
              </div>
            </CardContent>
          </Card>

          {/* Template Details */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Eye className="w-6 h-6 mr-2 text-purple-600" />
                Understanding Template Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <MousePointer className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Clicking on Templates</h4>
                  <p className="text-gray-600">Click anywhere on a template card to open the detailed view page where you can see more information and the workflow diagram.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <ArrowRight className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Workflow Visualization</h4>
                  <p className="text-gray-600">The template detail page shows a visual diagram of how the automation works, with connected boxes representing each step in the process.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Template Information</h4>
                  <p className="text-gray-600">Each template page includes the full description, pricing, and all technical details you need to understand what the automation does.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account & Authentication */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-6 h-6 mr-2 text-green-600" />
                Account Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <User className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Creating an Account</h4>
                  <p className="text-gray-600">Click "Sign Up" in the top-right corner to create your account. You'll need this to purchase and access templates.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Signing In</h4>
                  <p className="text-gray-600">Use "Sign In" to access your existing account. Once logged in, you'll see your profile menu in the top-right corner.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <ShoppingCart className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Dashboard Access</h4>
                  <p className="text-gray-600">After signing in, click on your profile picture and select "My Templates" to view all your purchased automation templates.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchasing */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="w-6 h-6 mr-2 text-orange-600" />
                Purchasing Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <MousePointer className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Purchase Process</h4>
                  <p className="text-gray-600">On any template detail page, click the "Purchase Template" button to start the secure checkout process.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CreditCard className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Payment Security</h4>
                  <p className="text-gray-600">All payments are processed securely through Stripe. We never store your payment information on our servers.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Download className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Instant Access</h4>
                  <p className="text-gray-600">After successful payment, templates are immediately available in your dashboard for download and use.</p>
                </div>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-5 h-5 mr-2 text-orange-600" />
                  <span className="font-semibold text-orange-900">Important</span>
                </div>
                <p className="text-orange-800">You must be signed in to purchase templates. Create an account first if you don't have one.</p>
              </div>
            </CardContent>
          </Card>

          {/* Dashboard */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShoppingCart className="w-6 h-6 mr-2 text-indigo-600" />
                Your Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Eye className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Viewing Purchased Templates</h4>
                  <p className="text-gray-600">Your dashboard shows all templates you've purchased. Each one includes the full workflow data and documentation.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Download className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Using Your Templates</h4>
                  <p className="text-gray-600">From your dashboard, you can view detailed workflow information and export data for use in your automation tools.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Lifetime Access</h4>
                  <p className="text-gray-600">Once purchased, templates remain in your dashboard forever. You can access them anytime you're signed in.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Getting Help */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="w-6 h-6 mr-2 text-red-600" />
                Need More Help?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                If you're still having trouble or have questions not covered in this guide, here are ways to get additional support:
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <User className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Check your account settings for profile and billing information</span>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Search className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Use the search function to find specific types of templates</span>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Eye className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Preview templates thoroughly before purchasing to ensure they meet your needs</span>
                </div>
              </div>
              
              <div className="mt-6 text-center">
                <Link to="/">
                  <Button className="mr-4">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Start Browsing Templates
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline">
                    <User className="w-4 h-4 mr-2" />
                    Create Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};
