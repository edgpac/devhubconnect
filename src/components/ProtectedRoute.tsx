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

// 🔒 SECURITY: Hybrid auth hook supporting both session and admin JWT
const useAuth = (): AuthContextType => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { currentUser: sessionUser, token: sessionToken, isLoading: providerLoading } = useAuthProvider();

  React.useEffect(() => {
    const checkAuth = () => {
      try {
        // 🔒 SECURITY: Primary - Use session-based authentication for regular users
        if (sessionUser && sessionToken) {
          setUser({
            id: sessionUser.id,
            email: sessionUser.email,
            role: sessionUser.isAdmin ? 'admin' : 'user',
            isAdmin: sessionUser.isAdmin || false
          });
          return;
        }

        // 🔒 SECURITY: Secondary - Check for admin JWT token (matches backend)
        const adminToken = localStorage.getItem('token');
        const adminAuth = localStorage.getItem('admin_auth');
        
        if (adminToken && adminAuth === 'true') {
          try {
            // Verify token is still valid (basic check)
            const tokenPayload = JSON.parse(atob(adminToken.split('.')[1]));
            const now = Math.floor(Date.now() / 1000);
            
            if (tokenPayload.exp && tokenPayload.exp > now && tokenPayload.isAdmin) {
              setUser({
                id: tokenPayload.id || 'admin_user_id',
                email: 'admin@devhubconnect.com',
                role: 'admin',
                isAdmin: true
              });
              return;
            } else {
              // Token expired or invalid, clean up
              localStorage.removeItem('token');
              localStorage.removeItem('admin_auth');
            }
          } catch (error) {
            console.error('Invalid admin token format:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('admin_auth');
          }
        }

        // No valid authentication found
        setUser(null);
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
  requiredRole?: 'user' | 'admin';           // ✅ KEEP: Backward compatibility
  requireAdmin?: boolean;                     // ✅ NEW: Modern prop
  requireCreatorOrAdmin?: boolean;            // ✅ NEW: Modern prop
}

// 🔒 SECURITY: Enhanced ProtectedRoute with backward compatibility
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole,
  requireAdmin = false,
  requireCreatorOrAdmin = false
}) => {
  const { user, isLoading } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  // 🔒 SECURITY: Redirect to login if no user
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 🔒 SECURITY: Normalize admin checking (handles both old and new props)
  const needsAdmin = requireAdmin || requiredRole === 'admin';
  const needsUser = requiredRole === 'user';

  // 🔒 SECURITY: Admin-only route protection
  if (needsAdmin && !user.isAdmin) {
    console.warn(`Access denied: User ${user.email} attempted to access admin route`);
    return <Navigate to="/admin" replace />;
  }

  // 🔒 SECURITY: Creator or Admin route protection
  if (requireCreatorOrAdmin && !user.isAdmin) {
    // Note: In a real app, you'd also check if user is the creator of the specific resource
    console.warn(`Access denied: User ${user.email} attempted to access creator/admin route`);
    return <Navigate to="/dashboard" replace />;
  }

  // 🔒 SECURITY: User-only routes (admins can access these too)
  if (needsUser && !user) {
    console.warn(`Access denied: No user for user-required route`);
    return <Navigate to="/login" replace />;
  }

  // 🔒 SECURITY: Log successful access for audit purposes
  const accessType = needsAdmin ? 'admin' : 
                    requireCreatorOrAdmin ? 'creator/admin' : 
                    needsUser ? 'user' :
                    'protected';
  
  console.log(`✅ Access granted: ${user.email} (${user.role}) → ${accessType} route`);
  
  return <>{children}</>;
};

// 🔒 SECURITY: Hook for components to check user permissions
export const useUserPermissions = () => {
  const { user } = useAuth();
  
  return {
    isAdmin: user?.isAdmin || false,
    isUser: !!user && !user.isAdmin,
    canEditTemplate: (templateCreatorId?: string) => {
      if (!user) return false;
      if (user.isAdmin) return true;
      return user.id === templateCreatorId;
    },
    canViewAdminPanel: user?.isAdmin || false,
    canManageUsers: user?.isAdmin || false,
  };
};

// 🔒 SECURITY: Admin-only wrapper component
export const AdminOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requireAdmin>
      {children}
    </ProtectedRoute>
  );
};

// 🔒 SECURITY: User-only wrapper component  
export const UserOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requiredRole="user">
      {children}
    </ProtectedRoute>
  );
};