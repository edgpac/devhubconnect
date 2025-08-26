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

// Session-based auth hook - no JWT token logic
const useAuth = (): AuthContextType => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { currentUser: sessionUser, isLoading: providerLoading } = useAuthProvider();

  React.useEffect(() => {
    const checkAuth = () => {
      try {
        // Use session-based authentication only
        if (sessionUser) {
          setUser({
            id: sessionUser.id,
            email: sessionUser.email,
            role: sessionUser.isAdmin ? 'admin' : 'user',
            isAdmin: sessionUser.isAdmin || false
          });
          return;
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
  }, [sessionUser, providerLoading]);

  return { user, isLoading };
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
  requireAdmin?: boolean;
  requireCreatorOrAdmin?: boolean;
}

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

  // Redirect to GitHub OAuth if no user
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Normalize admin checking (handles both old and new props)
  const needsAdmin = requireAdmin || requiredRole === 'admin';
  const needsUser = requiredRole === 'user';

  // Admin-only route protection
  if (needsAdmin && !user.isAdmin) {
    console.warn(`Access denied: User ${user.email} attempted to access admin route`);
    return <Navigate to="/dashboard" replace />;
  }

  // Creator or Admin route protection
  if (requireCreatorOrAdmin && !user.isAdmin) {
    // Note: In a real app, you'd also check if user is the creator of the specific resource
    console.warn(`Access denied: User ${user.email} attempted to access creator/admin route`);
    return <Navigate to="/dashboard" replace />;
  }

  // User-only routes (admins can access these too)
  if (needsUser && !user) {
    console.warn(`Access denied: No user for user-required route`);
    return <Navigate to="/auth" replace />;
  }

  // Log successful access for audit purposes
  const accessType = needsAdmin ? 'admin' : 
                    requireCreatorOrAdmin ? 'creator/admin' : 
                    needsUser ? 'user' :
                    'protected';
  
  console.log(`Access granted: ${user.email} (${user.role}) → ${accessType} route`);
  
  return <>{children}</>;
};

// Hook for components to check user permissions
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

// Admin-only wrapper component
export const AdminOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requireAdmin>
      {children}
    </ProtectedRoute>
  );
};

// User-only wrapper component  
export const UserOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requiredRole="user">
      {children}
    </ProtectedRoute>
  );
};