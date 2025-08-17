import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ShoppingBag, HelpCircle, Shield, RefreshCw, Github } from "lucide-react";
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

 // Enhanced session check with retry logic
 const checkSession = useCallback(async (retryCount = 0) => {
   try {
     // Skip token checking for cookie-based auth - call session directly
     console.log('🔐 Checking session with cookies...');

     console.log('🔐 Making session check request...');
     const response = await fetch('/auth/profile/session', {
       method: 'GET',
       credentials: 'include',
       headers: {
         'Content-Type': 'application/json'
       }
     });

     console.log('🔐 Session check response status:', response.status);

     if (response.ok) {
       const userData = await response.json();
       console.log('🔐 Session valid, user data:', userData);
       setUser(userData);
       setAuthError(null);
     } else {
       console.log('🔐 Session invalid, clearing user');
       setUser(null);
       setAuthError('Session expired. Please sign in again.');
     }
     
     setIsLoading(false);
   } catch (error) {
     console.error('🔐 Session check error:', error);
     
     if (retryCount < 3) {
       console.log(`🔐 Retrying session check (${retryCount + 1}/3)...`);
       return checkSession(retryCount + 1);
     }
     
     console.log('🔐 Max retries reached, clearing user');
     setUser(null);
     setAuthError('Unable to verify authentication. Please sign in.');
     setIsLoading(false);
   }
 }, []);

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
         
         // Use auth checker data and handle missing email gracefully
         const userData = {
           id: authUser.id,
           email: authUser.email || `user-${authUser.id.slice(0, 8)}@github.local`, // Fallback email
           name: authUser.username || authUser.name || 'GitHub User',
           avatar: authUser.avatar_url,
           isAdmin: false, // GitHub users are regular users by default
           role: 'user'
         };
         console.log('✅ Setting auth checker user:', userData.email);
         setUser(userData);
         setIsLoading(false);
         return;
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
   const handleStorageChange = (e: StorageEvent) => {
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

 // ✅ NEW: Handle GitHub authentication
 const handleGitHubAuth = () => {
   console.log('🔐 Redirecting to GitHub OAuth...');
   window.location.href = '/auth/github';
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
             // ✅ UPDATED: Single GitHub authentication button
             <div data-auth="sign-in" className="flex items-center">
               <Button 
                 onClick={handleGitHubAuth}
                 className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                 data-auth="github"
                 data-auth-nav="true"
               >
                 <Github className="mr-2 h-4 w-4" />
                 Continue with GitHub
               </Button>
             </div>
           )}
         </div>
       </div>
     </div>
   </nav>
 );
};