import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/context/AuthProvider';
import { toast } from 'sonner';

export const AuthSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, checkSession } = useAuth();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState('validating');

  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        console.log('🔗 Processing OAuth callback...');
        console.log('🔍 Current URL:', window.location.search);
        
        setCurrentStep('validating');
        
        // Get parameters from URL
        const success = searchParams.get('success');
        const userId = searchParams.get('userId');
        const userName = searchParams.get('userName');
        const userEmail = searchParams.get('userEmail');
        const oauthError = searchParams.get('error');

        console.log('🔍 OAuth params:', { success, userId, userName, userEmail, oauthError });

        // Check for errors
        if (success === 'false' || oauthError) {
          console.log('❌ OAuth failed:', oauthError);
          setError('GitHub authentication failed. Please try again.');
          setProcessing(false);
          return;
        }

        if (!userId || !userName) {
          console.log('❌ Missing OAuth parameters');
          setError('Missing authentication parameters. Please try logging in again.');
          setProcessing(false);
          return;
        }

        console.log('✅ OAuth parameters valid');
        setCurrentStep('session_sync');

        // Wait a moment for backend session to be established
        console.log('⏳ Waiting for backend session...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to get session from backend
        try {
          console.log('🔄 Checking backend session...');
          
          const sessionResponse = await fetch('/auth/profile/session', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (sessionData.success && sessionData.user) {
              console.log('✅ Backend session found:', sessionData.user.email || sessionData.user.name);
              
              const user = {
                id: sessionData.user.id,
                email: sessionData.user.email,
                name: sessionData.user.name,
                role: sessionData.user.role,
                isAdmin: sessionData.user.role === 'admin',
                username: sessionData.user.name,
                github_id: sessionData.user.id
              };

              // Login with session data - use JWT token for new system
              login('cookie-session', user);
              
              setCurrentStep('complete');
              setProcessing(false);
              
              toast.success("Login successful! Welcome to DevHub Connect");
              
              setTimeout(() => {
                console.log('🔄 Redirecting to dashboard...');
                navigate('/dashboard', { replace: true });
              }, 1500);
              
              return;
            }
          }
          
          console.log('⚠️ No backend session found, using URL parameters as fallback');
          
          // Fallback: Use URL parameters (for cases where cookie isn't set yet)
          const fallbackUser = {
            id: userId,
            email: userEmail || '',
            name: userName,
            role: 'user',
            isAdmin: false,
            username: userName,
            github_id: userId
          };

          login('fallback-session', fallbackUser);
          
          setCurrentStep('complete');
          setProcessing(false);
          
          toast.success("Login successful! Welcome to DevHub Connect");
          
          setTimeout(() => {
            console.log('🔄 Redirecting to dashboard...');
            navigate('/dashboard', { replace: true });
          }, 1500);

        } catch (sessionError) {
          console.error('❌ Session processing error:', sessionError);
          setError('Session setup failed. Please try logging in again.');
          setProcessing(false);
        }

      } catch (error) {
        console.error('❌ OAuth processing error:', error);
        setError('Authentication processing failed. Please try again.');
        setProcessing(false);
      }
    };

    // Start processing after a short delay
    const timer = setTimeout(processOAuthCallback, 500);
    return () => clearTimeout(timer);
  }, [searchParams, login, navigate, checkSession]);

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
              onClick={() => window.location.href = '/auth/github'}
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
      case 'session_sync':
        return 'Syncing with backend session...';
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
                currentStep === 'session_sync'
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

          <div className="mt-4 text-xs text-gray-400">
            Step: {currentStep}
          </div>
        </div>
      </div>
    </div>
  );
};