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
  authLocked: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global auth state manager to prevent conflicts
class AuthStateManager {
  private isChanging = false;
  private changeTimeout: NodeJS.Timeout | null = null;

  setState(user: User | null, token: string | null): boolean {
    // Prevent concurrent auth changes
    if (this.isChanging) {
      console.log('🔒 Auth change blocked - another change in progress');
      return false;
    }

    this.isChanging = true;
    console.log('🔐 Auth state changing:', user?.email || 'logout');

    try {
      if (user && token) {
        localStorage.setItem('token', token);
        localStorage.setItem('devhub_user', JSON.stringify(user));
        console.log('✅ Auth state saved for:', user.email);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('devhub_user');
        console.log('🔓 Auth state cleared');
      }

      // Release lock after a delay to prevent rapid changes
      if (this.changeTimeout) {
        clearTimeout(this.changeTimeout);
      }
      
      this.changeTimeout = setTimeout(() => {
        this.isChanging = false;
        console.log('🔓 Auth lock released');
      }, 2000); // 2 second lock to prevent clearing loops

      return true;
    } catch (error) {
      console.error('❌ Auth state change failed:', error);
      this.isChanging = false;
      return false;
    }
  }

  getState(): { user: User | null; token: string | null } {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('devhub_user');
      const user = userStr ? JSON.parse(userStr) : null;
      return { user, token };
    } catch (error) {
      console.error('❌ Failed to get auth state:', error);
      return { user: null, token: null };
    }
  }

  isLocked(): boolean {
    return this.isChanging;
  }

  forceUnlock(): void {
    console.log('🔓 Force unlocking auth state');
    this.isChanging = false;
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout);
      this.changeTimeout = null;
    }
  }
}

const authStateManager = new AuthStateManager();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authLocked, setAuthLocked] = useState(false);

  // Check if user is logged in on app startup
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        console.log('🔍 DEBUG: AuthProvider checking auth status...');
        
        // Check if we should skip verification (during login flow)
        const skipVerification = sessionStorage.getItem('skip_auth_check');
        if (skipVerification) {
          console.log('⏭️ Skipping backend verification during login flow');
          sessionStorage.removeItem('skip_auth_check');
          
          // Load from localStorage only
          const { user, token: storedToken } = authStateManager.getState();
          if (user && storedToken) {
            const enhancedUser = {
              ...user,
              isAdmin: user.role === 'admin' || user.isAdmin || false
            };
            setCurrentUser(enhancedUser);
            setToken(storedToken);
            console.log('✅ Auth loaded from localStorage:', enhancedUser.email);
          }
          setIsLoading(false);
          return;
        }

        // Load initial state from centralized manager
        const { user: savedUser, token: savedToken } = authStateManager.getState();
        
        if (savedUser && savedToken) {
          const enhancedUser = {
            ...savedUser,
            isAdmin: savedUser.role === 'admin' || savedUser.isAdmin || false
          };
          setCurrentUser(enhancedUser);
          setToken(savedToken);
          console.log('🔐 Initial auth state loaded:', enhancedUser.email);
          
          // Verify with backend (but don't clear on failure during first few seconds)
          verifyWithBackend(savedToken, enhancedUser);
        } else {
          console.log('🔓 No stored auth found');
          setIsLoading(false);
        }
      } catch (error) {
        console.log('🔍 DEBUG: Auth initialization error:', error);
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Verify auth with backend
  const verifyWithBackend = async (tokenToVerify: string, userToVerify: User) => {
    try {
      console.log('🔍 Verifying auth with backend for:', userToVerify.email);
      
      const response = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          console.log('✅ Backend verification successful:', data.user.email);
          
          // Update user data from backend if different
          const backendUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name || data.user.username,
            role: data.user.role,
            isAdmin: data.user.role === 'admin',
            username: data.user.username,
            github_id: data.user.github_id
          };
          
          if (JSON.stringify(backendUser) !== JSON.stringify(userToVerify)) {
            console.log('🔄 Updating user data from backend');
            setCurrentUser(backendUser);
            authStateManager.setState(backendUser, tokenToVerify);
          }
        } else {
          console.log('❌ Backend verification failed - invalid response');
          handleAuthFailure();
        }
      } else {
        console.log('❌ Backend verification failed:', response.status);
        // FIXED: Give more time for session to establish
        setTimeout(() => {
          if (!authStateManager.isLocked()) {
            console.log('⏰ Delayed auth clearing due to backend failure');
            handleAuthFailure();
          }
        }, 30000); // CHANGED: 30 seconds instead of 5 seconds
      }
    } catch (error) {
      console.error('❌ Backend verification error:', error);
      // Don't clear auth on network errors
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthFailure = () => {
    if (authStateManager.isLocked()) {
      console.log('🔒 Auth failure ignored - state is locked');
      return;
    }

    console.log('🔓 Clearing auth due to backend failure');
    logout();
  };

  const login = (newToken: string, user: User) => {
    if (authLocked || authStateManager.isLocked()) {
      console.log('🔒 Login blocked - auth is locked');
      return;
    }

    console.log('🔐 Login attempt for:', user.email);
    
    // Set auth lock for 10 seconds to prevent clearing (INCREASED)
    setAuthLocked(true);
    setTimeout(() => setAuthLocked(false), 10000); // CHANGED: 10 seconds instead of 5

    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };

    // Update state using centralized manager
    const success = authStateManager.setState(enhancedUser, newToken);
    if (success) {
      setCurrentUser(enhancedUser);
      setToken(newToken);
      console.log('✅ Login successful for:', enhancedUser.email);
      
      // Set skip flag to prevent immediate backend verification
      sessionStorage.setItem('skip_auth_check', 'true');
    } else {
      console.log('❌ Login failed - state manager rejected change');
    }
  };

  const setUser = (user: User) => {
    if (authLocked || authStateManager.isLocked()) {
      console.log('🔒 SetUser blocked - auth is locked');
      return;
    }

    console.log('🔍 DEBUG: AuthProvider setUser called with:', user);
    
    const enhancedUser = {
      ...user,
      isAdmin: user.role === 'admin' || user.isAdmin || false
    };
    
    const success = authStateManager.setState(enhancedUser, 'session');
    if (success) {
      setCurrentUser(enhancedUser);
      setToken('session');
      
      // Set flag to skip backend verification on next auth check
      sessionStorage.setItem('skip_auth_check', 'true');
      
      console.log('✅ User set via AuthProvider:', enhancedUser.email, 'Role:', enhancedUser.role);
    }
  };

  const logout = async () => {
    if (authLocked || authStateManager.isLocked()) {
      console.log('🔒 Logout blocked - auth is locked');
      return;
    }

    try {
      console.log('🔍 DEBUG: Attempting logout...');
      await apiCall(API_ENDPOINTS.AUTH_LOGOUT, {
        method: 'POST',
      });
      console.log('✅ Backend logout successful');
    } catch (error) {
      console.error('❌ Backend logout error:', error);
    }

    // Clear all auth data using centralized manager
    const success = authStateManager.setState(null, null);
    if (success) {
      setCurrentUser(null);
      setToken(null);
      
      // Clear any skip flags
      sessionStorage.removeItem('skip_auth_check');
      sessionStorage.removeItem('permanent_session');
      
      console.log('✅ Auth data cleared, redirecting to home');
      window.location.href = '/';
    }
  };

  // Listen for storage changes from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (authLocked || authStateManager.isLocked()) {
        console.log('🔒 Storage change ignored - auth is locked');
        return;
      }

      if (e.key === 'token' || e.key === 'devhub_user') {
        console.log('🔐 Storage changed externally:', e.key);
        
        // Reload auth state
        const { user, token: storedToken } = authStateManager.getState();
        if (user) {
          const enhancedUser = {
            ...user,
            isAdmin: user.role === 'admin' || user.isAdmin || false
          };
          setCurrentUser(enhancedUser);
        } else {
          setCurrentUser(null);
        }
        setToken(storedToken);
        
        if (user && storedToken) {
          console.log('✅ Auth reloaded from storage:', user.email);
        } else {
          console.log('🔓 Auth cleared from storage');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [authLocked]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      authStateManager.forceUnlock();
    };
  }, []);

  // Show loading state while checking auth
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
      authLocked: authLocked || authStateManager.isLocked(),
      isLoading 
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