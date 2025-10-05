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
  Info,
  Github,
  Shield,
  Lock,
  Bot
} from "lucide-react";
import { Link } from "react-router-dom";

export const GuidancePage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Header */}
      <section className="bg-primary text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold mb-4">
            How to Use DevHubConnect
          </h1>
          <p className="text-xl text-blue-100">
            Your complete guide to discovering, purchasing, and using automation templates securely with AI assistance
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
                Get started in 3 simple steps with secure GitHub authentication
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
                  <h3 className="font-semibold mb-2">Sign In & Purchase</h3>
                  <p className="text-sm text-gray-600">Sign in with GitHub to securely purchase templates - authentication required</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-600 font-bold text-lg">3</span>
                  </div>
                  <h3 className="font-semibold mb-2">Access & Use</h3>
                  <p className="text-sm text-gray-600">View your purchased templates in your personal dashboard with AI helper support</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Helper */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bot className="w-6 h-6 mr-2 text-emerald-600" />
                AI Helper & Setup Assistance
              </CardTitle>
              <CardDescription>
                Intelligent assistance powered by Groq AI for template setup and customization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Bot className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Interactive AI Chat</h4>
                  <p className="text-gray-600">Each purchased template includes an AI chat assistant that can answer questions about setup, configuration, and troubleshooting specific to your template.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <ArrowRight className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Automated Setup Instructions</h4>
                  <p className="text-gray-600">Click "Generate Setup Instructions" to get AI-powered, step-by-step guidance tailored to your specific template and workflow requirements.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Smart Configuration Help</h4>
                  <p className="text-gray-600">Ask the AI helper about API keys, webhook URLs, credential setup, testing procedures, and troubleshooting common issues with your automation.</p>
                </div>
              </div>
              
              <div className="bg-emerald-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <Bot className="w-5 h-5 mr-2 text-emerald-600" />
                  <span className="font-semibold text-emerald-900">AI Helper Examples</span>
                </div>
                <p className="text-emerald-800">Try asking: "How do I add Gmail credentials?", "Where do I find my webhook URL?", or "How do I test this workflow in n8n?"</p>
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
                <Github className="w-6 h-6 mr-2 text-gray-900" />
                GitHub Authentication
              </CardTitle>
              <CardDescription>
                Secure, one-click authentication powered by GitHub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Github className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Sign In with GitHub</h4>
                  <p className="text-gray-600">Click "Continue with GitHub" to sign in securely. Your GitHub account is used to create and access your DevHubConnect profile automatically.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Automatic Account Creation</h4>
                  <p className="text-gray-600">No separate registration needed! Your account is created automatically when you first sign in with GitHub, using your GitHub profile information.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <User className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Profile & Dashboard Access</h4>
                  <p className="text-gray-600">After signing in, you'll see your GitHub username in the top-right corner. Click it to access "My Templates" and view your purchases.</p>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                  <span className="font-semibold text-green-900">Why GitHub?</span>
                </div>
                <p className="text-green-800">GitHub authentication ensures your purchases are securely linked to your account and prevents any payment/access issues. It's the most reliable way to protect your investment.</p>
              </div>
            </CardContent>
          </Card>

          {/* Secure Purchasing */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lock className="w-6 h-6 mr-2 text-red-600" />
                Secure Template Purchasing
              </CardTitle>
              <CardDescription>
                Protected checkout process with authentication verification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Lock className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Authentication Required</h4>
                  <p className="text-gray-600">You MUST be signed in with GitHub to purchase templates. This ensures your purchase is properly linked to your account and prevents any loss of access.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Duplicate Purchase Prevention</h4>
                  <p className="text-gray-600">Our system automatically prevents you from purchasing the same template twice, protecting you from accidental duplicate charges.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CreditCard className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Secure Payment Processing</h4>
                  <p className="text-gray-600">All payments are processed securely through Stripe with end-to-end encryption. Your payment information is never stored on our servers.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Download className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Instant Secure Access</h4>
                  <p className="text-gray-600">After successful payment, templates are immediately available in your dashboard, securely linked to your GitHub account for lifetime access.</p>
                </div>
              </div>
              
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                  <span className="font-semibold text-red-900">Critical Security Notice</span>
                </div>
                <p className="text-red-800">Purchasing without being signed in is not possible. This security measure protects your money and ensures you can always access your purchased templates.</p>
              </div>
            </CardContent>
          </Card>

          {/* Dashboard */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShoppingCart className="w-6 h-6 mr-2 text-indigo-600" />
                Your Secure Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Github className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">GitHub-Linked Templates</h4>
                  <p className="text-gray-600">Your dashboard shows all templates purchased with your GitHub account. Each purchase is securely linked to prevent any access issues.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Download className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Download & Use Templates</h4>
                  <p className="text-gray-600">From your dashboard, you can download template files, view detailed workflow information, and access setup instructions for your automation tools.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Bot className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">AI Helper Access</h4>
                  <p className="text-gray-600">Each purchased template includes access to an AI chat assistant and automated setup instruction generator to help you implement your automations quickly.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Permanent Access</h4>
                  <p className="text-gray-600">Once purchased, templates remain in your dashboard forever. As long as you can access your GitHub account, you can access your templates.</p>
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <Info className="w-5 h-5 mr-2 text-indigo-600" />
                  <span className="font-semibold text-indigo-900">Access Your Dashboard</span>
                </div>
                <p className="text-indigo-800">After signing in with GitHub, look for your username/avatar in the top-right corner and click "My Templates" to view your purchased automation templates.</p>
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="w-6 h-6 mr-2 text-yellow-600" />
                Troubleshooting & Common Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Lock className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Can't Purchase Templates</h4>
                  <p className="text-gray-600">If purchase buttons don't work, make sure you're signed in with GitHub first. Unauthenticated users cannot make purchases for security reasons.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Search className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">Don't See Your Templates</h4>
                  <p className="text-gray-600">Templates are linked to your GitHub account. Make sure you're signed in with the same GitHub account you used to make the purchase.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Bot className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">AI Helper Not Responding</h4>
                  <p className="text-gray-600">If the AI chat isn't working, try refreshing the page or asking simpler, more specific questions about your template setup or configuration.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Github className="w-5 h-5 mt-1 text-gray-500" />
                <div>
                  <h4 className="font-semibold">GitHub Sign-In Issues</h4>
                  <p className="text-gray-600">If GitHub authentication fails, try clearing your browser cache or using an incognito/private browsing window.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Getting Help */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Info className="w-6 h-6 mr-2 text-blue-600" />
                Need More Help?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                If you're still having trouble or have questions not covered in this guide, here are ways to get additional support:
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Github className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Ensure you're signed in with GitHub before attempting any purchases</span>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Shield className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Check that your GitHub account email matches your purchase email</span>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Bot className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-700">Use the AI helper in your dashboard for template-specific setup questions</span>
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
                <Link to="/auth">
                  <Button variant="outline">
                    <Github className="w-4 h-4 mr-2" />
                    Sign In with GitHub
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