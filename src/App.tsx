import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// HomePage stays eagerly loaded — it IS the landing page, must paint immediately
import { HomePage } from "./pages/HomePage";

import Footer from "./components/Footer";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./components/context/AuthProvider";

// All other pages lazy-loaded — downloaded only when the user navigates to them.
// Named exports need the .then(m => ({ default: m.X })) unwrap for React.lazy.
const TemplateDetail  = lazy(() => import('./pages/TemplateDetail').then(m  => ({ default: m.TemplateDetail  })));
const TemplateEdit    = lazy(() => import('./pages/TemplateEdit').then(m    => ({ default: m.TemplateEdit    })));
const AdminLogin      = lazy(() => import('./pages/AdminLogin').then(m      => ({ default: m.AdminLogin      })));
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard').then(m  => ({ default: m.AdminDashboard  })));
const AuthPage        = lazy(() => import('./pages/AuthPage').then(m        => ({ default: m.AuthPage        })));
const Dashboard       = lazy(() => import('./pages/Dashboard').then(m       => ({ default: m.Dashboard       })));
const GuidancePage    = lazy(() => import('./pages/GuidancePage').then(m    => ({ default: m.GuidancePage    })));
const StudioPage      = lazy(() => import('./pages/StudioPage'));
const NotFound        = lazy(() => import('./pages/NotFound'));
const SuccessPage     = lazy(() => import('./pages/SuccessPage').then(m     => ({ default: m.SuccessPage     })));
const Analytics       = lazy(() => import('@/pages/AdminAnalytics'));
const AuthSuccess     = lazy(() => import('./pages/AuthSuccess').then(m     => ({ default: m.AuthSuccess     })));
const ProfilePage     = lazy(() => import('./pages/ProfilePage').then(m     => ({ default: m.ProfilePage     })));
const SettingsPage    = lazy(() => import('./pages/SettingsPage').then(m    => ({ default: m.SettingsPage    })));
const TermsOfService  = lazy(() => import('./pages/TermsOfService').then(m  => ({ default: m.TermsOfService  })));
const PrivacyPolicy   = lazy(() => import('./pages/PrivacyPolicy').then(m   => ({ default: m.PrivacyPolicy   })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

// Admin-only route protection component
const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requireAdmin>
    {children}
  </ProtectedRoute>
);

// GitHub OAuth redirect component
const GitHubAuthRedirect = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const purchaseSuccess = urlParams.get('purchase') === 'success';

  if (purchaseSuccess) {
    window.location.href = 'https://www.devhubconnect.com/dashboard';
  } else {
    window.location.href = 'https://www.devhubconnect.com/auth/github';
  }

  return <div>Redirecting to {purchaseSuccess ? 'dashboard' : 'GitHub authentication'}...</div>;
};

// Minimal spinner shown while a lazy chunk downloads
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomePage />} />

                {/* ✅ FIXED: Added /templates/:id route (with 's') */}
                <Route path="/templates/:id" element={<TemplateDetail />} />

                {/* ✅ KEPT: Old /template/:id route for backward compatibility */}
                <Route path="/template/:id" element={<TemplateDetail />} />

                <Route path="/guidance" element={<GuidancePage />} />
                <Route path="/studio" element={<ProtectedRoute><StudioPage /></ProtectedRoute>} />
                <Route path="/success" element={<SuccessPage />} />

                {/* Legal Pages */}
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />

                {/* Authentication Routes */}
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/login" element={<GitHubAuthRedirect />} />
                <Route path="/register" element={<GitHubAuthRedirect />} />
                <Route path="/auth/success" element={<AuthSuccess />} />

                {/* Protected User Routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Template Edit Routes (Creator/Admin Only) */}
                <Route
                  path="/template/:id/edit"
                  element={
                    <ProtectedRoute requireCreatorOrAdmin>
                      <TemplateEdit />
                    </ProtectedRoute>
                  }
                />

                {/* ✅ ADDED: Also support /templates/:id/edit for consistency */}
                <Route
                  path="/templates/:id/edit"
                  element={
                    <ProtectedRoute requireCreatorOrAdmin>
                      <TemplateEdit />
                    </ProtectedRoute>
                  }
                />

                {/* Admin-Only Routes */}
                <Route path="/admin" element={<AdminLogin />} />
                <Route
                  path="/admin/dashboard"
                  element={
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <AdminRoute>
                      <Analytics />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/templates/:id/edit"
                  element={
                    <AdminRoute>
                      <TemplateEdit />
                    </AdminRoute>
                  }
                />

                {/* 404 Catch-all route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>

            <Footer />
          </>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
