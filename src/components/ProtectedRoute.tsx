import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth as useAuthProvider } from './context/AuthProvider';

interface User {
  id: string;
  email: string;
  role?: 'user' | 'admin';
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

// ✅ SIMPLIFIED: Use only AuthProvider, no phantom window.authChecker
const useAuth = (): AuthContextType => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { currentUser: sessionUser, token: sessionToken, isLoading: providerLoading } = useAuthProvider();

  React.useEffect(() => {
    const checkAuth = () => {
      try {
        // ✅ SIMPLIFIED: Use only AuthProvider session
        if (sessionUser && sessionToken) {
          console.log('🔐 Session Auth Found:', sessionUser.email);
          setUser({
            id: sessionUser.id,
            email: sessionUser.email,
            role: sessionUser.isAdmin ? 'admin' : 'user',
            isAdmin: sessionUser.isAdmin || false
          });
          setIsLoading(false);
          return;
        }

        // ✅ FALLBACK: Check localStorage for persistence
        const token = localStorage.getItem('token');
        const adminAuth = localStorage.getItem('admin_auth');
        const savedUser = localStorage.getItem('devhub_user');
        
        console.log('🔐 Auth Check:', {
          hasSessionUser: !!sessionUser,
          hasToken: !!token,
          hasAdminAuth: !!adminAuth,
          hasSavedUser: !!savedUser
        });

        if (token && (savedUser || adminAuth)) {
          let userData = null;
          
          // Try to parse saved user data
          if (savedUser) {
            try {
              userData = JSON.parse(savedUser);
            } catch (error) {
              console.error('Error parsing devhub_user:', error);
            }
          }

          // Handle admin_auth case
          if (adminAuth === 'true' || userData?.isAdmin) {
            setUser({
              id: userData?.id || 'admin',
              email: userData?.email || 'admin@devhubconnect.com',
              role: 'admin',
              isAdmin: true
            });
          } else if (userData) {
            setUser({
              id: userData.id,
              email: userData.email,
              role: userData.isAdmin ? 'admin' : 'user',
              isAdmin: userData.isAdmin || false
            });
          } else {
            setUser(null);
          }
        } else {
          // No token found
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setUser(null);
      } finally {
        if (!providerLoading) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();
  }, [sessionUser, sessionToken, providerLoading]);

  return { user, isLoading };
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('❌ No user found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // Check role requirements
  if (requiredRole && user.role !== requiredRole) {
    console.warn(`User ${user.email} (role: ${user.role}) attempted to access a ${requiredRole} route.`);
    
    // Better redirect logic
    if (requiredRole === 'admin') {
      return <Navigate to="/admin" replace />; // Redirect to admin login for admin routes
    } else {
      return <Navigate to="/dashboard" replace />; // Redirect to dashboard for user routes
    }
  }

  console.log('✅ Access granted for user:', user.email, 'role:', user.role);
  return <>{children}</>;
};