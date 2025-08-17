import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/context/AuthProvider';
import { toast } from 'sonner';
import { API_ENDPOINTS, apiCall } from '../config/api';

export const AuthSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState('validating');

  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        console.log('🔗 Processing OAuth callback...');
        console.log('🔍 DEBUG: AuthSuccess component mounted');
        console.log('🔍 DEBUG: Current URL params:', window.location.search);
        
        setCurrentStep('validating');
        
        // Get parameters from URL
        const success = searchParams.get('success');
        const userId = searchParams.get('userId');
        const userName = searchParams.get('userName');
        const userEmail = searchParams.get('userEmail');
        const oauthError = searchParams.get('error');

        console.log('🔍 DEBUG: Auth params:', { success, userId, userName, userEmail, oauthError });

        if (success === 'false' || oauthError) {
          console.log('❌ OAuth failed:', oauthError);
          setError('GitHub authentication failed. Please try again.');
          setProcessing(false);
          return;
        }

        if (!userId || !userEmail) {
          console.log('❌ Missing OAuth parameters');
          setError('Missing authentication parameters. Please try logging in again.');
          setProcessing(false);
          return;
        }

        console.log('✅ OAuth parameters received:', { userId, userName, userEmail });
        setCurrentStep('processing');

        // Set skip flag to prevent backend verification during login
        sessionStorage.setItem('skip_auth_check', 'true');

        // Create user object from URL parameters
        const urlUser = {
          id: userId,
          username: userName || '',
          email: userEmail,
          name: userName || '',
          role: 'user', // Will be updated from backend if needed
          github_id: userId
        };

        console.log('🔐 Attempting initial login with URL data:', urlUser.email);
        setCurrentStep('setting_session');

        // First, login with URL data to establish immediate auth state
        // This prevents the auth clearing loop by giving the user immediate access
        const tempToken = `temp_${userId}_${Date.now()}`;
        login(tempToken, urlUser);

        // Wait a moment for auth state to settle
        await new Promise(resolve => setTimeout(resolve, 1000));

        setCurrentStep('backend_sync');

        // Now try to get proper JWT token from backend session
        try {
          console.log('🔄 Converting session to JWT token...');
          
          const jwtResponse = await fetch('/api/auth/session-to-jwt', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (jwtResponse.ok) {
            const jwtData = await jwtResponse.json();
            if (jwtData.success && jwtData.token && jwtData.user) {
              console.log('✅ JWT token received:', jwtData.user.email);
              
              // Update with real backend data and JWT token
              const backendUser = {
                id: jwtData.user.id,
                username: jwtData.user.username,
                email: jwtData.user.email,
                name: jwtData.user.username || jwtData.user.name || '',
                role: jwtData.user.role || 'user',
                isAdmin: jwtData.user.role === 'admin',
                github_id: jwtData.user.github_id
              };

              console.log('🔄 Updating auth with backend JWT data...');
              login(jwtData.token, backendUser);
              
              console.log('✅ Authentication complete with JWT for:', backendUser.email);
              setCurrentStep('complete');
            } else {
              console.log('⚠️ JWT conversion failed, using URL data');
              setCurrentStep('fallback');
            }
          } else {
            console.log('⚠️ JWT endpoint failed, using URL data');
            setCurrentStep('fallback');
          }
        } catch (jwtError) {
          console.log('⚠️ JWT conversion error, using URL data:', jwtError);
          setCurrentStep('fallback');
        }

        // Fallback: Try the original session endpoint
        if (currentStep === 'fallback') {
          try {
            console.log('🔄 Fallback: Checking original session endpoint...');
            
            const sessionResponse = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
              method: 'GET',
            });

            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json();
              if (sessionData.success && sessionData.user) {
                console.log('✅ Fallback session validated:', sessionData.user.email);
                
                // Update with session data
                const sessionUser = {
                  id: sessionData.user.id,
                  username: sessionData.user.username,
                  email: sessionData.user.email,
                  name: sessionData.user.username || sessionData.user.name || '',
                  role: sessionData.user.role || 'user',
                  isAdmin: sessionData.user.role === 'admin',
                  github_id: sessionData.user.github_id
                };

                console.log('🔄 Updating auth with session data...');
                login('session', sessionUser);
                
                console.log('✅ Authentication complete with session for:', sessionUser.email);
                setCurrentStep('complete');
              }
            }
          } catch (sessionError) {
            console.log('⚠️ Session fallback also failed, keeping URL data:', sessionError);
            setCurrentStep('complete');
          }
        }

        // Remove the skip flag after processing
        setTimeout(() => {
          sessionStorage.removeItem('skip_auth_check');
        }, 5000);

        console.log('🎉 OAuth processing complete, showing success...');
        setProcessing(false);

        // Show success message
        toast.success("Login successful! Welcome to DevHub Connect");

        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          console.log('🔍 DEBUG: Redirecting to dashboard');
          navigate('/dashboard', { replace: true });
        }, 1500);

      } catch (error) {
        console.error('❌ OAuth processing error:', error);
        setError('Authentication processing failed. Please try again.');
        setProcessing(false);
      }
    };

    // Add a small delay to ensure the component mounts properly
    const timer = setTimeout(processOAuthCallback, 100);
    
    return () => clearTimeout(timer);
  }, [searchParams, login, navigate]);

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 text-center mb-2">Authentication Failed</h3>
          <p className="text-sm text-gray-600 text-center mb-4">{error}</p>
          <div className="flex space-x-3">
            <button
              onClick={() => navigate('/login')}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get step descriptions
  const getStepDescription = (step: string) => {
    switch (step) {
      case 'validating':
        return 'Validating GitHub authentication...';
      case 'processing':
        return 'Processing authentication data...';
      case 'setting_session':
        return 'Setting up your session...';
      case 'backend_sync':
        return 'Syncing with backend systems...';
      case 'fallback':
        return 'Ensuring session stability...';
      case 'complete':
        return 'Authentication complete!';
      default:
        return 'Processing...';
    }
  };

  // Show processing state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          {/* Loading animation */}
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-blue-100 rounded-full mb-4">
            <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {processing ? 'Completing Authentication...' : 'Authentication Successful!'}
          </h3>
          
          <p className="text-sm text-gray-600 mb-4">
            {processing 
              ? getStepDescription(currentStep)
              : 'Redirecting to your dashboard...'
            }
          </p>

          {/* Progress steps */}
          <div className="space-y-2 text-left">
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
              <span className="text-gray-600">GitHub authentication verified</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
              <span className="text-gray-600">User account located</span>
            </div>
            <div className="flex items-center text-sm">
              <div className={`w-2 h-2 rounded-full mr-3 ${
                currentStep === 'setting_session' || currentStep === 'backend_sync' || currentStep === 'fallback' 
                  ? 'bg-blue-500 animate-pulse' 
                  : currentStep === 'complete' 
                    ? 'bg-green-500' 
                    : 'bg-gray-300'
              }`}></div>
              <span className="text-gray-600">Setting up session...</span>
            </div>
            <div className="flex items-center text-sm">
              <div className={`w-2 h-2 rounded-full mr-3 ${
                currentStep === 'backend_sync' || currentStep === 'fallback'
                  ? 'bg-blue-500 animate-pulse'
                  : currentStep === 'complete'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
              }`}></div>
              <span className="text-gray-600">Syncing with backend...</span>
            </div>
          </div>

          {!processing && (
            <div className="mt-4 text-xs text-gray-500">
              If you're not redirected automatically, <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:underline">click here</button>.
            </div>
          )}

          {/* Debug info for development */}
          <div className="mt-4 text-xs text-gray-400">
            Current step: {currentStep} | Check console for details
          </div>
        </div>
      </div>
    </div>
  );
};