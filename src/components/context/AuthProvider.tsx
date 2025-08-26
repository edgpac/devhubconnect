import React, { createContext, useState, useEffect, useContext } from "react";
import { apiCall, API_ENDPOINTS } from '@/config/api.ts';

type User = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isAdmin?: boolean;
  username?: string;
  github_id?: string;
  avatar?: string;
};

type AuthContextType = {
  currentUser: User | null;
  login: (user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  isLoading: boolean;
  checkSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Session check function - relies on session cookies only
  const checkSession = async () => {
    try {
      console.log('Checking session with backend...');
      
      const response = await apiCall(API_ENDPOINTS.AUTH_SESSION);

      if (response.ok) {
        const data = await response.json();
        
        if (data && data.id) {
          console.log('Session valid:', data.email || data.name);
          
          const user = {
            id: data.id,
            email: data.email,
            name: data.name,
            role: data.role,
            isAdmin: data.isAdmin || data.role === 'admin',
            username: data.name || data.email?.split('@')[0],
            github_id: data.id,
            avatar: data.avatar || data.avatar_url
          };
          
          setCurrentUser(user);
          
          // Cache user profile for UI performance only
          localStorage.setItem('devhub_user', JSON.stringify(user));
          
          return;
        }
      }
      
      console.log('No valid session found');
      clearAuth();
      
    } catch (error) {
      console.error('Session check error:', error);
      // Don't clear auth on network errors, just log them
    }
  };

  // Handle OAuth callback
  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // CRITICAL FIX: Only handle OAuth callbacks, not Stripe returns
    const isStripeReturn = urlParams.get('purchase') === 'success';
    
    if (isStripeReturn) {
      console.log('Stripe purchase return detected - skipping OAuth handler');
      return; // Don't interfere with Stripe returns
    }
    
    if (urlParams.get('success') === 'true') {
      console.log('OAuth success detected! Checking session...');
      
      // Clean URL first
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Wait for session to be fully established
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check for new session
      await checkSession();
    } else if (urlParams.get('auth_error')) {
      console.log('OAuth error detected:', urlParams.get('auth_error'));
      clearAuth();
    }
  };

  // Clear authentication state
  const clearAuth = () => {
    console.log('Clearing auth state');
    setCurrentUser(null);
    localStorage.removeItem('devhub_user');
  };

  // Initialize auth on app startup
  useEffect(() => {
    const initAuth = async () => {
      console.log('Initializing Auth Checker...');
      
      // Handle OAuth callback first
      await handleOAuthCallback();
      
      // Check for cached user profile to prevent flash
      const storedUserStr = localStorage.getItem('devhub_user');
      
      if (storedUserStr) {
        try {
          const storedUser = JSON.parse(storedUserStr);
          console.log('Found cached user profile:', storedUser.email || storedUser.username);
          
          // Set immediately to prevent flash
          setCurrentUser(storedUser);
          
          // Verify session is still valid in background
          await checkSession();
        } catch (error) {
          console.error('Error parsing cached user:', error);
          clearAuth();
        }
      } else {
        console.log('No cached user found');
        // Check for existing session
        await checkSession();
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Login function - session cookies handled by browser automatically
  const login = (user: User) => {
    console.log('Login for:', user.email || user.username);
    
    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };

    setCurrentUser(enhancedUser);
    
    // Cache user profile for UI performance
    localStorage.setItem('devhub_user', JSON.stringify(enhancedUser));
    
    console.log('Login successful for:', enhancedUser.email || enhancedUser.username);
  };

  // Set user function (for manual updates)
  const setUser = (user: User) => {
    console.log('Setting user:', user.email || user.username);
    
    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };
    
    setCurrentUser(enhancedUser);
    
    // Update cached profile
    localStorage.setItem('devhub_user', JSON.stringify(enhancedUser));
    
    console.log('User updated:', enhancedUser.email || enhancedUser.username);
  };

  // Logout function - clears session cookie on backend
  const logout = async () => {
    console.log('Starting logout...');
    
    try {
      const response = await apiCall(API_ENDPOINTS.AUTH_LOGOUT, {
        method: 'POST'
      });
      console.log('Backend logout successful');
    } catch (error) {
      console.error('Backend logout error:', error);
    }

    // Clear local state
    clearAuth();
    
    console.log('Logout complete, redirecting...');
    window.location.href = '/';
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      login, 
      logout, 
      setUser,
      isLoading,
      checkSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};