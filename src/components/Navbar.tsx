import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ShoppingBag, HelpCircle, Shield, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/context/AuthProvider";

interface User {
 id: string;
 name?: string;
 email: string;
 avatar?: string;
 isAdmin?: boolean;
 role?: 'user' | 'admin';
}

interface NavbarProps {
 user?: User;
 onSignOut?: () => void;
}

// Hook to get current user from localStorage/token
const useCurrentUser = () => {
 const [user, setUser] = useState<User | null>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [authError, setAuthError] = useState<string | null>(null);

 // Function to refresh token
 const refreshToken = useCallback(async () => {
   try {
     console.log('🔄 Attempting token refresh...');
     const response = await fetch('/api/auth/refresh', {
       method: 'POST',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json'
       }
     });

     console.log('🔄 Token refresh response status:', response.status);

     if (response.ok) {
       const data = await response.json();
       if (data.token) {
         localStorage.setItem('token', data.token);
         console.log('✅ Token refresh successful');
         return true;
       }
     }
     console.log('❌ Token refresh failed');
     return false;
   } catch (error) {
     console.error('❌ Token refresh failed:', error);
     return false;
   }
 }, []);

 // Enhanced session check with retry logic
 const checkSession = useCallback(async (retryCount = 0) => {
   try {
     const token = localStorage.getItem('token');
     console.log('🔐 Checking session, token exists:', !!token);
     
     if (!token) {
       console.log('🔐 No token found, setting user to null');
       setUser(null);
       setIsLoading(false);
       return;
     }

     console.log('🔐 Making session check request...');
     const response = await fetch('/api/auth/profile/session', {
       method: 'GET',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token}`
       }
     });

     console.log('🔐 Session check response status:', response.status);

     // If unauthorized and we haven't tried refreshing yet
     if (response.status === 401 && retryCount === 0) {
       console.log('🔄 Token expired, attempting refresh...');
       const refreshSuccess = await refreshToken();
       
       if (refreshSuccess) {
         // Retry the session check with new token
         console.log('🔄 Retrying session check with new token...');
         return checkSession(1);
       } else {
         // Refresh failed, clear auth data
         console.log('❌ Refresh failed, clearing auth data');
         localStorage.removeItem('token');
         localStorage.removeItem('devhub_user');
         localStorage.removeItem('admin_auth');
         setUser(null);
         setAuthError('Session expired. Please sign in again.');
         setIsLoading(false);
         return;
       }
     }

     if (response.ok) {
       const data = await response.json();
       console.log('✅ Session check successful, user data:', data.user ? 'present' : 'missing');
       if (data.user) {
         const userData = {
           id: data.user.id,
           email: data.user.email || '',
           name: data.user.username || data.user.name || data.user.email?.split('@')[0] || 'User',
           avatar: data.user.avatar_url,
           isAdmin: data.user.isAdmin || data.user.role === 'admin',
           role: data.user.role || (data.user.isAdmin ? 'admin' : 'user')
         };
         
         console.log('✅ Setting user data:', userData.email);
         setUser(userData);
         setAuthError(null);
         
         // Update localStorage with fresh data
         localStorage.setItem('devhub_user', JSON.stringify(userData));
         setIsLoading(false);
         return;
       }
     }

     // If we get here, session check failed
     throw new Error(`Session check failed with status: ${response.status}`);
     
   } catch (error) {
     console.error('❌ Session check error:', error);
     
     // Fallback to localStorage data if available
     const savedUser = localStorage.getItem('devhub_user');
     const adminAuth = localStorage.getItem('admin_auth');
     
     console.log('🔐 Falling back to localStorage, savedUser exists:', !!savedUser);
     
     if (savedUser) {
       try {
         const userData = JSON.parse(savedUser);
         console.log('✅ Using localStorage user data:', userData.email);
         setUser({
           ...userData,
           isAdmin: userData.isAdmin || adminAuth === 'true'
         });
         setAuthError('Using offline data. Some features may be limited.');
       } catch (parseError) {
         console.error('❌ Error parsing saved user:', parseError);
         setUser(null);
         setAuthError('Authentication error. Please sign in again.');
       }
     } else {
       console.log('❌ No localStorage data available');
       setUser(null);
       setAuthError('Unable to verify authentication. Please sign in.');
     }
     
     setIsLoading(false);
   }
 }, [refreshToken]);

 useEffect(() => {
   const checkUser = async () => {
     try {
       console.log('🔐 Starting user check...');
       console.log('🔐 Auth checker status:', {
         exists: !!window.authChecker,
         isAuthenticated: window.authChecker?.isAuthenticated,
         hasUser: !!window.authChecker?.user,
         userData: window.authChecker?.user
       });
       
       // ✅ NEW: First check global auth checker
       if (window.authChecker && window.authChecker.isAuthenticated && window.authChecker.user) {
         console.log('✅ Using global auth checker');
         console.log('🔐 Auth checker user data:', window.authChecker.user);
         const authUser = window.authChecker.user;
         
         // Skip if user data is empty or invalid
         if (!authUser.id && !authUser.email) {
           console.log('❌ Auth checker user data is empty, falling back to session check');
         } else {
           const userData = {
             id: authUser.id,
             email: authUser.email || '',
             name: authUser.username || authUser.email?.split('@')[0] || 'User',
             avatar: authUser.avatar_url,
             isAdmin: false, // GitHub users are regular users by default
             role: 'user'
           };
           console.log('✅ Setting auth checker user:', userData.email);
           setUser(userData);
           setIsLoading(false);
           return;
         }
       }

       // ✅ ENHANCED: Check session endpoint directly
       try {
         console.log('🔐 Checking session endpoint...');
         await checkSession();
         return;
       } catch (sessionError) {
         console.log('❌ Session check failed, checking localStorage...');
       }

       // ✅ FALLBACK: Check localStorage
       const token = localStorage.getItem('token');
       const adminAuth = localStorage.getItem('admin_auth'); // ✅ ADDED: Check admin_auth
       const savedUser = localStorage.getItem('devhub_user'); // ✅ FIXED: Changed from 'user' to 'devhub_user'
       
       console.log('🔐 Navbar Auth Check:', {
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
             console.log('✅ Parsed saved user data:', userData.email);
           } catch (error) {
             console.error('❌ Error parsing devhub_user:', error);
           }
         }

         // ✅ FIXED: Handle admin_auth case
         if (adminAuth === 'true' || userData?.isAdmin) {
           console.log('✅ Setting admin user');
           setUser({
             id: userData?.id || 'admin',
             email: userData?.email || 'admin@devhubconnect.com',
             name: userData?.name || 'Administrator',
             avatar: userData?.avatar,
             isAdmin: true,
             role: 'admin'
           });
         } else if (userData) {
           console.log('✅ Setting regular user');
           setUser({
             id: userData.id,
             email: userData.email,
             name: userData.name || userData.email.split('@')[0], // Use email prefix if no name
             avatar: userData.avatar,
             isAdmin: userData.isAdmin || false,
             role: userData.isAdmin ? 'admin' : 'user'
           });
         } else {
           console.log('❌ No valid user data found');
           setUser(null);
         }
       } else {
         console.log('❌ No token or saved user found');
         setUser(null);
       }
     } catch (error) {
       console.error('❌ Error reading user data:', error);
       setUser(null);
     } finally {
       setIsLoading(false);
     }
   };

   checkUser();

   // Check auth status every 30 seconds
   const authInterval = setInterval(() => {
     if (user) {
       console.log('🔐 30-second auth check...');
       checkSession();
     }
   }, 30000);

   // ✅ NEW: Listen for auth checker changes
   const checkInterval = setInterval(() => {
     if (window.authChecker && window.authChecker.isAuthenticated !== !!user) {
       console.log('🔐 Auth checker state changed');
       checkUser();
     }
   }, 2000);

   // Listen for storage changes (when user logs in/out in another tab)
   const handleStorageChange = (e) => {
     if (e.key === 'token' || e.key === 'devhub_user') {
       console.log('🔐 Storage changed:', e.key);
       checkSession();
     }
   };

   // Listen for focus events to check auth when user returns to tab
   const handleFocus = () => {
     if (user) {
       console.log('🔐 Window focus - checking auth...');
       checkSession();
     }
   };

   window.addEventListener('storage', handleStorageChange);
   window.addEventListener('focus', handleFocus);
   return () => {
     window.removeEventListener('storage', handleStorageChange);
     window.removeEventListener('focus', handleFocus);
     clearInterval(checkInterval);
     clearInterval(authInterval);
   };
 }, [user, checkSession]);

 return { user, isLoading, authError, refreshAuth: checkSession };
};

export const Navbar = ({ user: propUser, onSignOut }: NavbarProps) => {
 const { user: detectedUser, isLoading, authError, refreshAuth } = useCurrentUser();
 const { logout } = useAuth();
 const [isRefreshing, setIsRefreshing] = useState(false);
 
 // Use prop user if provided, otherwise use detected user
 const user = propUser || detectedUser;

 console.log('🔐 Navbar render - user:', user ? user.email : 'none', 'authError:', authError);

 // ✅ FIXED: Use AuthProvider's logout function and global auth checker
 const handleSignOut = async () => {
   try {
     console.log('🔐 Signing out...');
     if (window.authChecker) {
       await window.authChecker.logout();
     } else if (onSignOut) {
       // If a custom onSignOut is provided, use it
       onSignOut();
     } else {
       // Use AuthProvider's logout function (this calls backend + clears state + redirects)
       logout();
     }
   } catch (error) {
     console.error('❌ Logout error:', error);
   }
 };

 const handleRefreshAuth = async () => {
   console.log('🔐 Manual auth refresh triggered');
   setIsRefreshing(true);
   await refreshAuth();
   setIsRefreshing(false);
 };

 if (isLoading && !propUser) {
   // Show loading state only if no prop user provided
   return (
     <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex justify-between items-center h-16">
           <Link to="/" className="flex items-center space-x-2">
             <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
               <span className="text-white font-bold text-sm">DH</span>
             </div>
             <span className="text-xl font-bold text-gray-900">DevHub<span className="text-blue-600">Connect</span></span>
           </Link>
           <div className="w-20 h-8 bg-gray-200 animate-pulse rounded"></div>
         </div>
       </div>
     </nav>
   );
 }

 return (
   <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
     <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
       <div className="flex justify-between items-center h-16">
         <Link to="/" className="flex items-center space-x-2">
           <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
             <span className="text-white font-bold text-sm">DH</span>
           </div>
           <span className="text-xl font-bold text-gray-900">DevHub<span className="text-blue-600">Connect</span></span>
         </Link>

         <div className="flex items-center space-x-4">
           <Link to="/guidance">
             <Button variant="ghost" className="flex items-center space-x-2">
               <HelpCircle className="w-4 w-4" />
               <span>Guidance</span>
             </Button>
           </Link>
           
           {user ? (
             <div data-auth="user-info" className="flex items-center space-x-4">
               {/* Show auth error indicator */}
               {authError && (
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={handleRefreshAuth}
                   disabled={isRefreshing}
                   className="text-amber-600 hover:text-amber-700"
                   title={authError}
                 >
                   <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                 </Button>
               )}
               
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                     <Avatar className="h-8 w-8">
                       <AvatarImage src={user.avatar} alt={user.name || user.email} />
                       <AvatarFallback>
                         {user.isAdmin ? 'A' : (user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase())}
                       </AvatarFallback>
                     </Avatar>
                     {user.isAdmin && (
                       <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 border-2 border-white rounded-full">
                         <Shield className="h-2 w-2 text-white" />
                       </div>
                     )}
                     {/* Show warning indicator for auth issues */}
                     {authError && (
                       <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-amber-500 border-2 border-white rounded-full" />
                     )}
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56" align="end" forceMount>
                   {/* Show auth status */}
                   {authError && (
                     <DropdownMenuItem 
                       onClick={handleRefreshAuth}
                       disabled={isRefreshing}
                       className="text-amber-600 border-b"
                     >
                       <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                       <span className="text-xs">Refresh Session</span>
                     </DropdownMenuItem>
                   )}
                   
                   {user.isAdmin && (
                     <>
                       <DropdownMenuItem asChild>
                         <Link to="/admin/dashboard" className="flex items-center">
                           <Shield className="mr-2 h-4 w-4 text-red-500" />
                           <span>Admin Dashboard</span>
                         </Link>
                       </DropdownMenuItem>
                       <DropdownMenuItem className="border-b">
                         <div className="flex items-center text-xs text-gray-500">
                           <Shield className="mr-1 h-3 w-3" />
                           <span>Administrator</span>
                         </div>
                       </DropdownMenuItem>
                     </>
                   )}
                   <DropdownMenuItem asChild>
                     <Link to="/dashboard" className="flex items-center">
                       <ShoppingBag className="mr-2 h-4 w-4" />
                       <span>My Templates</span>
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={handleSignOut}>
                     <LogOut className="mr-2 h-4 w-4" />
                     <span>Sign out</span>
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </div>
           ) : (
             <div data-auth="sign-in" className="flex items-center space-x-2">
               <Link to="/login">
                 <Button 
                   variant="ghost"
                   data-auth="sign-in"
                   data-auth-nav="true"
                 >
                   Sign In
                 </Button>
               </Link>
               <Link to="/register">
                 <Button>Sign Up</Button>
               </Link>
             </div>
           )}
         </div>
       </div>
     </div>
   </nav>
 );
};