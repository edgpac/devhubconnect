import React from 'react';
import { Navigate } from 'react-router-dom';

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

// ✅ FIXED: Updated to match AdminLogin localStorage keys
const useAuth = (): AuthContextType => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkAuth = () => {
      try {
        // Check for JWT token
        const token = localStorage.getItem('token');
        const adminAuth = localStorage.getItem('admin_auth'); // ✅ ADDED: Check admin_auth
        const savedUser = localStorage.getItem('devhub_user'); // ✅ FIXED: Changed from 'user' to 'devhub_user'
        
        console.log('🔐 Auth Check:', {
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

          // ✅ FIXED: Handle admin_auth case
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
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  return { user, isLoading };
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="text-center p-12">Loading authentication...</div>;
  }

  if (!user) {
    console.log('❌ No user found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // Check role requirements
  if (requiredRole && user.role !== requiredRole) {
    console.warn(`User ${user.email} (role: ${user.role}) attempted to access a ${requiredRole} route.`);
    
    // ✅ IMPROVED: Better redirect logic
    if (requiredRole === 'admin') {
      return <Navigate to="/admin" replace />; // Redirect to admin login for admin routes
    } else {
      return <Navigate to="/dashboard" replace />; // Redirect to dashboard for user routes
    }
  }

  console.log('✅ Access granted for user:', user.email, 'role:', user.role);
  return <>{children}</>;
};