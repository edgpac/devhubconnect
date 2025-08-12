import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3000/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // ✅ FIXED: Save JWT token instead of simple flag
        localStorage.setItem('token', data.token); // JWT token from backend
        localStorage.setItem('devhub_user', JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          isAdmin: true,
          role: 'admin'
        }));
        
        // Also keep the old admin_auth for backward compatibility if needed
        localStorage.setItem('admin_auth', 'true');
        
        // Success notification
        console.log('✅ Admin login successful!');
        
        window.location.href = '/admin/dashboard';
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred. Please check the server and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToSite = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header with Admin Badge */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Shield className="h-12 w-12 text-purple-400 mr-3" />
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
              <Badge variant="secondary" className="mt-2 bg-purple-600 text-white">
                <Shield className="h-3 w-3 mr-1" />
                Administrator Access
              </Badge>
            </div>
          </div>
          <p className="text-slate-300">
            Secure access to DevHubConnect administration
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-white flex items-center justify-center">
              <Shield className="h-5 w-5 mr-2 text-purple-400" />
              Admin Login
            </CardTitle>
            <CardDescription className="text-slate-300">
              Enter the admin password to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Password Field with Show/Hide */}
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Admin Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-purple-400 pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-white"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Security Notice */}
              <div className="flex items-start space-x-2 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-200">
                  <strong>Security Notice:</strong> Admin access is logged and monitored.
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Logging In...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Access Admin Panel
                  </>
                )}
              </Button>
            </form>

            {/* Back to Site */}
            <div className="mt-6 pt-4 border-t border-slate-700">
              <Button
                variant="ghost"
                onClick={handleBackToSite}
                className="w-full text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to DevHubConnect
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-slate-400 text-sm">
          <p>DevHubConnect Admin Portal v1.0</p>
          <p className="mt-1">Secure • Monitored • Encrypted</p>
        </div>
      </div>
    </div>
  );
}