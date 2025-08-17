import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/context/AuthProvider';
import { toast } from 'sonner';
import { API_ENDPOINTS, apiCall } from '../config/api';

export const AuthSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    console.log('🔍 DEBUG: AuthSuccess component mounted');
    console.log('🔍 DEBUG: Current URL params:', window.location.search);
    console.log('🔍 DEBUG: API_BASE_URL:', window.location.origin);
    
    const handleAuthSuccess = async () => {
      const success = searchParams.get('success');
      const userId = searchParams.get('userId');
      const userName = searchParams.get('userName');
      const userEmail = searchParams.get('userEmail');

      console.log('🔍 DEBUG: Auth params:', { success, userId, userName, userEmail });

      if (success === 'true' && userId && userEmail) {
        try {
          console.log('🔍 DEBUG: Attempting API call to:', API_ENDPOINTS.AUTH_SESSION);
          
          // Get complete user data from backend API (including avatar)
          const response = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
            method: 'GET',
          });

          console.log('🔍 DEBUG: API response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('🔍 DEBUG: API response data:', data);
                        
            // Use complete user data from API
            login("session", data.user);

            // Show success message
            toast.success("Login successful! Welcome to DevHub Connect");
            console.log('🔍 DEBUG: Redirecting to dashboard');

            // Redirect to dashboard where user can see their purchases
            navigate('/dashboard');
          } else {
            console.log('🔍 DEBUG: API call failed, using fallback');
            // Fallback to URL params if API fails
            const user = {
              id: userId,
              name: userName || '',
              email: userEmail
            };
            login("session", user);
            
            // Show success message
            toast.success("Login successful! Welcome to DevHub Connect");
            console.log('🔍 DEBUG: Redirecting to dashboard (fallback)');
            
            // Redirect to dashboard
            navigate('/dashboard');
          }
        } catch (error) {
          console.error('🔍 DEBUG: Error fetching user data:', error);
          // Fallback to URL params
          const user = {
            id: userId,
            name: userName || '',
            email: userEmail
          };
          login("session", user);
          
          // Show success message
          toast.success("Login successful! Welcome to DevHub Connect");
          console.log('🔍 DEBUG: Redirecting to dashboard (error fallback)');
          
          // Redirect to dashboard
          navigate('/dashboard');
        }
      } else {
        console.error('🔍 DEBUG: Auth success failed - missing parameters:', { success, userId, userEmail });
        toast.error("Login failed - missing authentication data");
        navigate('/login');
      }
    };

    // Add a small delay to ensure the component mounts properly
    const timer = setTimeout(handleAuthSuccess, 100);
    
    return () => clearTimeout(timer);
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing login...</p>
        <p className="mt-2 text-sm text-gray-500">Redirecting to dashboard...</p>
        <p className="mt-2 text-xs text-gray-400">Check console for debug info</p>
      </div>
    </div>
  );
};
