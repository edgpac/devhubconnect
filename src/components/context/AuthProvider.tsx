import React, { createContext, useState, useEffect, useContext } from "react";
import { API_ENDPOINTS, apiCall } from '../../config/api';

type User = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isAdmin?: boolean;
  username?: string;
  github_id?: string;
};

type AuthContextType = {
  currentUser: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  isLoading: boolean;
  checkSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simple session check function
  const checkSession = async () => {
    try {
      console.log('🔍 Checking session with backend...');
      
      const response = await fetch('/auth/profile/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          console.log('✅ Session valid:', data.user.email || data.user.username);
          
          const user = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name || data.user.username,
            role: data.user.role,
            isAdmin: data.user.role === 'admin',
            username: data.user.username,
            github_id: data.user.github_id
          };
          
          setCurrentUser(user);
          setToken('session'); // Use 'session' as token indicator
          
          // Store in localStorage for persistence
          localStorage.setItem('token', 'session');
          localStorage.setItem('devhub_user', JSON.stringify(user));
          
          return;
        }
      }
      
      console.log('❌ No valid session found');
      clearAuth();
      
    } catch (error) {
      console.error('❌ Session check error:', error);
      // Don't clear auth on network errors, just log them
    }
  };

  // Clear authentication state
  const clearAuth = () => {
    console.log('🔓 Clearing auth state');
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('devhub_user');
  };

  // Initialize auth on app startup
  useEffect(() => {
    const initAuth = async () => {
      console.log('🚀 Initializing Auth Checker...');
      
      // Check if we have stored auth
      const storedToken = localStorage.getItem('token');
      const storedUserStr = localStorage.getItem('devhub_user');
      
      if (storedToken && storedUserStr) {
        try {
          const storedUser = JSON.parse(storedUserStr);
          console.log('🔍 Found stored auth for:', storedUser.email || storedUser.username);
          
          // Set immediately to prevent flash
          setCurrentUser(storedUser);
          setToken(storedToken);
          
          // Verify with backend in the background
          await checkSession();
        } catch (error) {
          console.error('❌ Error parsing stored user:', error);
          clearAuth();
        }
      } else {
        console.log('🔍 No stored auth found');
        // Still check for existing session
        await checkSession();
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Login function
  const login = (newToken: string, user: User) => {
    console.log('🔐 Login for:', user.email || user.username);
    
    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };

    setCurrentUser(enhancedUser);
    setToken(newToken);
    
    // Store in localStorage
    localStorage.setItem('token', newToken);
    localStorage.setItem('devhub_user', JSON.stringify(enhancedUser));
    
    console.log('✅ Login successful for:', enhancedUser.email || enhancedUser.username);
  };

  // Set user function (for manual updates)
  const setUser = (user: User) => {
    console.log('🔄 Setting user:', user.email || user.username);
    
    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };
    
    setCurrentUser(enhancedUser);
    setToken('session');
    
    localStorage.setItem('token', 'session');
    localStorage.setItem('devhub_user', JSON.stringify(enhancedUser));
    
    console.log('✅ User updated:', enhancedUser.email || enhancedUser.username);
  };

  // Logout function
  const logout = async () => {
    console.log('🔐 Starting logout...');
    
    try {
      // Call backend logout - Fixed endpoint
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Backend logout successful');
    } catch (error) {
      console.error('❌ Backend logout error:', error);
    }

    // Clear local state
    clearAuth();
    
    console.log('✅ Logout complete, redirecting...');
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
      token, 
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