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
    const handleAuthSuccess = async () => {
      const success = searchParams.get('success');
      const userId = searchParams.get('userId');
      const userName = searchParams.get('userName');
      const userEmail = searchParams.get('userEmail');

      if (success === 'true' && userId && userEmail) {
        try {
          // Get complete user data from backend API (including avatar)
          const response = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
            method: 'GET',
          });

          if (response.ok) {
            const data = await response.json();
            
            // Use complete user data from API
            login("session", data.user);
            
            toast.success("GitHub login successful!", {
              description: `Welcome ${data.user.name || userEmail}!`
            });

            // Redirect to dashboard where user can see their purchases
            navigate('/dashboard');
          } else {
            // Fallback to URL params if API fails
            const user = {
              id: userId,
              name: userName || '',
              email: userEmail
            };
            login("session", user);
            navigate('/dashboard');
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Fallback to URL params
          const user = {
            id: userId,
            name: userName || '',
            email: userEmail
          };
          login("session", user);
          navigate('/dashboard');
        }
      } else {
        toast.error("Login failed");
        navigate('/login');
      }
    };

    handleAuthSuccess();
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing login...</p>
      </div>
    </div>
  );
};