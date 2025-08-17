import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from "sonner";

// ✅ Corrected useAuth import based on actual file path
import { useAuth } from "@/components/context/AuthProvider";

export const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ✅ Use login from context
  const { login } = useAuth();

  // Get the redirect path from location state or default to dashboard
  const from = location.state?.from || '/dashboard';

  useEffect(() => {
    // Check if user is already authenticated
    checkAuthStatus();
    
    // Handle GitHub OAuth callback if we're on the callback route
    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth');
    const error = urlParams.get('error');
    
    if (authSuccess === 'success') {
      // GitHub OAuth was successful, redirect to intended destination
      handleAuthSuccess();
    } else if (error) {
      setAuthError('Authentication failed. Please try again.');
      setIsLoading(false);
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (response.ok) {
        // User is already authenticated, redirect to dashboard or intended page
        navigate(from, { replace: true });
      }
    } catch (error) {
      console.log('User not authenticated');
    }
  };

  const handleAuthSuccess = async () => {
    try {
      setIsLoading(true);
      
      // Verify authentication with backend
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('✅ Authentication successful:', userData.user?.username || userData.user?.email);
        
        // ✅ Save to AuthProvider
        const fakeToken = "github-auth-token";
        login(fakeToken, userData.user);
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Navigate to intended destination
        navigate(from, { replace: true });
      } else {
        setAuthError('Authentication verification failed. Please try again.');
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      setAuthError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ FIX: Updated handleGithubAuth to redirect to backend's GitHub OAuth initiation endpoint
  const handleGithubAuth = () => {
    setIsLoading(true);
    setAuthError(null);
    
    // Store the intended destination in sessionStorage for after OAuth
    if (from !== '/dashboard') {
      sessionStorage.setItem('auth_redirect', from);
    }
    
    // Redirect to your backend's GitHub OAuth initiation route
    // This route on your backend will then redirect to GitHub's authorization page.
    window.location.href = "/auth/github";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Signing you in...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">DH</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">DevHub<span className="text-blue-600">Connect</span></span>
          </Link>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>
              Sign in with GitHub to access premium automation templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authError && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{authError}</p>
              </div>
            )}

            {/* ✅ FIXED: Added data-auth attributes for the GitHub button */}
            <Button
              variant="outline"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white border-gray-900"
              onClick={handleGithubAuth}
              disabled={isLoading}
              data-auth="github"
              data-auth-primary="sign-in"
            >
              <Github className="mr-2 h-4 w-4" />
              Continue with GitHub
            </Button>

            {/* ✅ ADDED: User info display area (hidden by default) */}
            <div 
              data-auth="user-info" 
              style={{ display: 'none' }} 
              className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200"
            >
              {/* User info will be populated by the auth checker */}
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Secure GitHub Authentication</span>
              </div>
            </div>

            <div className="text-center space-y-2">
              <Link to="/" className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors">
                <ArrowLeft className="mr-1 h-3 w-3" />
                Back to marketplace
              </Link>
              
              <div className="text-xs text-gray-500 space-y-1">
                <p>By continuing, you agree to our Terms of Service</p>
                <p>Your GitHub profile will be used to create your account</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};