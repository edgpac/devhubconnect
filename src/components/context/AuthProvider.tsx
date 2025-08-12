import React, { createContext, useState, useEffect, useContext } from "react";
import { API_ENDPOINTS, apiCall } from '../../config/api';

type User = {
 id: string;
 email: string;
 name?: string;
 role?: string; // ✅ ADDED: Include role field
 isAdmin?: boolean; // ✅ ADDED: Include isAdmin field
};

type AuthContextType = {
 currentUser: User | null;
 token: string | null;
 login: (token: string, user: User) => void;
 logout: () => void;
 setUser: (user: User) => void; // Add setUser method
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
       // First check localStorage (for backward compatibility)
       const savedToken = localStorage.getItem("token");
       const savedUser = localStorage.getItem("devhub_user");

       if (savedToken && savedUser) {
         setToken(savedToken);
         setCurrentUser(JSON.parse(savedUser));
         setIsLoading(false);
         return;
       }

       // If no localStorage data, check session cookie by calling verify endpoint
       const response = await apiCall(API_ENDPOINTS.AUTH_SESSION, {
         method: 'GET',
       });

       if (response.ok) {
         const data = await response.json();
         if (data.success && data.user) {
           // ✅ FIXED: User is logged in via session cookie - include ALL user fields
           const userData = {
             id: data.user.id,
             email: data.user.email,
             name: data.user.name,
             role: data.user.role, // ✅ ADDED: Include role
             isAdmin: data.user.role === 'admin' // ✅ ADDED: Set isAdmin based on role
           };
           
           setCurrentUser(userData);
           setToken('session'); // Placeholder since we're using session cookies
           console.log('✅ User logged in via session cookie:', data.user.email, 'Role:', data.user.role);
           
           // Save to localStorage for Navbar compatibility
           localStorage.setItem("token", "session");
           localStorage.setItem("devhub_user", JSON.stringify(userData));
         }
       }
     } catch (error) {
       console.log('No active session found');
     } finally {
       setIsLoading(false);
     }
   };

   checkAuthStatus();
 }, []);

 const login = (token: string, user: User) => {
   // ✅ ENHANCED: Ensure isAdmin is set correctly
   const enhancedUser = {
     ...user,
     isAdmin: user.role === 'admin' || user.isAdmin || false
   };
   
   setToken(token);
   setCurrentUser(enhancedUser);
   localStorage.setItem("token", token);
   localStorage.setItem("devhub_user", JSON.stringify(enhancedUser));
 };

 const setUser = (user: User) => {
   // ✅ ENHANCED: Ensure isAdmin is set correctly
   const enhancedUser = {
     ...user,
     isAdmin: user.role === 'admin' || user.isAdmin || false
   };
   
   setCurrentUser(enhancedUser);
   setToken('session'); // For session-based auth
   // Save to localStorage for consistency
   localStorage.setItem("token", "session");
   localStorage.setItem("devhub_user", JSON.stringify(enhancedUser));
 };

 const logout = async () => {
   try {
     // Call logout endpoint to clear session cookie
     await apiCall(API_ENDPOINTS.AUTH_LOGOUT, {
       method: 'POST',
     });
     console.log('✅ Logout successful - session cleared');
   } catch (error) {
     console.error('❌ Logout error:', error);
   }

   // Clear frontend state regardless of backend success/failure
   setToken(null);
   setCurrentUser(null);
   localStorage.removeItem("token");
   localStorage.removeItem("devhub_user");
   
   // FIX: Redirect to home page after logout
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