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

// Hook to get current user from AuthProvider
const useCurrentUser = () => {
const [user, setUser] = useState<User | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [authError, setAuthError] = useState<string | null>(null);
const { currentUser, checkSession } = useAuth();

// Enhanced session check with retry logic
const refreshAuth = useCallback(async (retryCount = 0) => {
  try {
    console.log('🔐 Refreshing auth...');
    await checkSession();
    setAuthError(null);
  } catch (error) {
    console.error('🔐 Auth refresh error:', error);
    
    if (retryCount < 3) {
      console.log(`🔐 Retrying auth refresh (${retryCount + 1}/3)...`);
      return refreshAuth(retryCount + 1);
    }
    
    console.log('🔐 Max retries reached');
    setAuthError('Unable to verify authentication. Please sign in.');
  }
}, [checkSession]);

useEffect(() => {
  const checkUser = async () => {
    try {
      console.log('🔐 Starting user check...');
      
      // ✅ SIMPLIFIED: Use AuthProvider's currentUser directly
      if (currentUser) {
        console.log('✅ Using AuthProvider user:', currentUser.email);
        setUser({
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name || currentUser.email.split('@')[0],
          avatar: currentUser.avatar,
          isAdmin: currentUser.isAdmin || false,
          role: currentUser.isAdmin ? 'admin' : 'user'
        });
        setAuthError(null);
      } else {
        console.log('❌ No user from AuthProvider');
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Error checking user:', error);
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
      refreshAuth();
    }
  }, 30000);

  // Listen for storage changes (when user logs in/out in another tab)
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'token' || e.key === 'devhub_user') {
      console.log('🔐 Storage changed:', e.key);
      refreshAuth();
    }
  };

  // Listen for focus events to check auth when user returns to tab
  const handleFocus = () => {
    if (user) {
      console.log('🔐 Window focus - checking auth...');
      refreshAuth();
    }
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('focus', handleFocus);
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('focus', handleFocus);
    clearInterval(authInterval);
  };
}, [currentUser, user, refreshAuth]);

return { user, isLoading, authError, refreshAuth };
};

export const Navbar = ({ user: propUser, onSignOut }: NavbarProps) => {
const { user: detectedUser, isLoading, authError, refreshAuth } = useCurrentUser();
const { logout } = useAuth();
const [isRefreshing, setIsRefreshing] = useState(false);

// Use prop user if provided, otherwise use detected user
const user = propUser || detectedUser;

console.log('🔐 Navbar render - user:', user ? user.email : 'none', 'authError:', authError);

// ✅ SIMPLIFIED: Use AuthProvider's logout function
const handleSignOut = async () => {
  try {
    console.log('🔐 Signing out...');
    if (onSignOut) {
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

// ✅ Handle GitHub authentication
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
              <HelpCircle className="w-4 h-4" />
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
            // ✅ GitHub authentication button
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