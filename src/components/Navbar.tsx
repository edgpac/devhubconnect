import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Settings, ShoppingBag, HelpCircle, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/context/AuthProvider"; // ✅ ADDED: Import useAuth

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

  useEffect(() => {
    const checkUser = () => {
      try {
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
            } catch (error) {
              console.error('Error parsing devhub_user:', error);
            }
          }

          // ✅ FIXED: Handle admin_auth case
          if (adminAuth === 'true' || userData?.isAdmin) {
            setUser({
              id: userData?.id || 'admin',
              email: userData?.email || 'admin@devhubconnect.com',
              name: userData?.name || 'Administrator',
              avatar: userData?.avatar,
              isAdmin: true,
              role: 'admin'
            });
          } else if (userData) {
            setUser({
              id: userData.id,
              email: userData.email,
              name: userData.name || userData.email.split('@')[0], // Use email prefix if no name
              avatar: userData.avatar,
              isAdmin: userData.isAdmin || false,
              role: userData.isAdmin ? 'admin' : 'user'
            });
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error reading user data:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    // Listen for storage changes (when user logs in/out in another tab)
    const handleStorageChange = () => {
      checkUser();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { user, isLoading };
};

export const Navbar = ({ user: propUser, onSignOut }: NavbarProps) => {
  const { user: detectedUser, isLoading } = useCurrentUser();
  const { logout } = useAuth(); // ✅ ADDED: Get logout function from AuthProvider
  
  // Use prop user if provided, otherwise use detected user
  const user = propUser || detectedUser;

  // ✅ FIXED: Use AuthProvider's logout function
  const handleSignOut = () => {
    if (onSignOut) {
      // If a custom onSignOut is provided, use it
      onSignOut();
    } else {
      // Use AuthProvider's logout function (this calls backend + clears state + redirects)
      logout();
    }
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
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
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
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/login">
                  <Button variant="ghost">Sign In</Button>
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