import React, { createContext, useState, useEffect, useContext } from "react";
import { API_ENDPOINTS, apiCall } from '../../config/api';

type User = {
 id: string;
 email: string;
 name?: string;
 role?: string;
 isAdmin?: boolean;
};

type AuthContextType = {
 currentUser: User | null;
 token: string | null;
 login: (token: string, user: User) => void;
 logout: () => void;
 setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
 const [currentUser, setCurrentUser] = useState<User | null>(null);
 const [token, setToken] = useState<string | null>(null);
 const [isLoading, setIsLoading] = useState(true);

 // Check if user is logged in on app startup
 useEffect(() => {
   const checkAuthStatus = async () => {
     try {
       console.log('🔍 DEBUG: AuthProvider checking auth status...');
       
       // First check localStorage for existing session
       const savedUser = localStorage.getItem("devhub_user");
       const savedToken = localStorage.getItem("token");

       if (savedUser && savedToken) {
         console.log('🔍 DEBUG: Found saved user in localStorage');
         const userData = JSON.parse(savedUser);
         setCurrentUser(userData);
         setToken(savedToken);
         
         // Skip backend verification if we just logged in via AuthSuccess
         const skipVerification = sessionStorage.getItem('skip_auth_check');
         if (skipVerification) {
           console.log('🔍 DEBUG: Skipping backend verification (just logged in)');
           sessionStorage.removeItem('skip_auth_check');
           setIsLoading(false);
           return;
         }
       }

       // Try to verify session with backend
       console.log('🔍 DEBUG: Checking backend session...');
       const response = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
         method: 'GET',
       });

       console.log('🔍 DEBUG: Backend response status:', response.status);

       if (response.ok) {
         const data = await response.json();
         console.log('🔍 DEBUG: Backend response data:', data);
         
         if (data.success && data.user) {
           const userData = {
             id: data.user.id,
             email: data.user.email,
             name: data.user.name || data.user.username,
             role: data.user.role,
             isAdmin: data.user.role === 'admin'
           };
           
           setCurrentUser(userData);
           setToken('session');
           
           // Save to localStorage
           localStorage.setItem("token", "session");
           localStorage.setItem("devhub_user", JSON.stringify(userData));
           
           console.log('✅ User verified via backend session:', userData.email, 'Role:', userData.role);
         } else {
           console.log('🔍 DEBUG: Backend session invalid, clearing local data');
           // Clear invalid session data
           localStorage.removeItem("token");
           localStorage.removeItem("devhub_user");
           setCurrentUser(null);
           setToken(null);
         }
       } else {
         console.log('🔍 DEBUG: Backend session check failed, but keeping local session if exists');
         // If we have local data but backend fails, keep the local session
         // This handles the case where AuthSuccess just set the user but backend session isn't ready
         if (savedUser && savedToken) {
           console.log('🔍 DEBUG: Keeping local session despite backend failure');
           // Keep the existing local session
         } else {
           // No local session and backend failed, clear everything
           localStorage.removeItem("token");
           localStorage.removeItem("devhub_user");
           setCurrentUser(null);
           setToken(null);
         }
       }
     } catch (error) {
       console.log('🔍 DEBUG: Auth check error:', error);
       // Keep existing local session if backend is unreachable
       const savedUser = localStorage.getItem("devhub_user");
       if (savedUser) {
         console.log('🔍 DEBUG: Backend unreachable, keeping local session');
       }
     } finally {
       setIsLoading(false);
     }
   };

   checkAuthStatus();
 }, []);

 const login = (token: string, user: User) => {
   console.log('🔍 DEBUG: AuthProvider login called with:', { token, user });
   
   const enhancedUser = {
     ...user,
     isAdmin: user.role === 'admin' || user.isAdmin || false
   };
   
   setToken(token);
   setCurrentUser(enhancedUser);
   localStorage.setItem("token", token);
   localStorage.setItem("devhub_user", JSON.stringify(enhancedUser));
   
   // Set flag to skip backend verification on next auth check
   sessionStorage.setItem('skip_auth_check', 'true');
   
   console.log('✅ User logged in via AuthProvider:', enhancedUser.email, 'Role:', enhancedUser.role);
 };

 const setUser = (user: User) => {
   console.log('🔍 DEBUG: AuthProvider setUser called with:', user);
   
   const enhancedUser = {
     ...user,
     isAdmin: user.role === 'admin' || user.isAdmin || false
   };
   
   setCurrentUser(enhancedUser);
   setToken('session');
   localStorage.setItem("token", "session");
   localStorage.setItem("devhub_user", JSON.stringify(enhancedUser));
   
   // Set flag to skip backend verification on next auth check
   sessionStorage.setItem('skip_auth_check', 'true');
   
   console.log('✅ User set via AuthProvider:', enhancedUser.email, 'Role:', enhancedUser.role);
 };

 const logout = async () => {
   try {
     console.log('🔍 DEBUG: Attempting logout...');
     await apiCall(API_ENDPOINTS.AUTH_LOGOUT, {
       method: 'POST',
     });
     console.log('✅ Backend logout successful');
   } catch (error) {
     console.error('❌ Backend logout error:', error);
   }

   // Clear all auth data
   setToken(null);
   setCurrentUser(null);
   localStorage.removeItem("token");
   localStorage.removeItem("devhub_user");
   sessionStorage.removeItem('skip_auth_check');
   
   console.log('✅ Auth data cleared, redirecting to home');
   window.location.href = '/';
 };

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
   <AuthContext.Provider value={{ currentUser, token, login, logout, setUser }}>
     {children}
   </AuthContext.Provider>
 );
};

export const useAuth = (): AuthContextType => {
 const context = useContext(AuthContext);
 if (!context) throw new Error("useAuth must be used within an AuthProvider");
 return context;
};