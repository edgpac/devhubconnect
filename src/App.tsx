import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { HomePage } from "./pages/HomePage";
import { TemplateDetail } from "./pages/TemplateDetail";
import { TemplateEdit } from "./pages/TemplateEdit";
import { AdminLogin } from "./pages/AdminLogin";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { GuidancePage } from "./pages/GuidancePage";
import NotFound from "./pages/NotFound";
import { SuccessPage } from "./pages/SuccessPage";
import Analytics from '@/pages/AdminAnalytics';
import { AuthSuccess } from "./pages/AuthSuccess";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

import Footer from "./components/Footer";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./components/context/AuthProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
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

// GitHub OAuth redirect component with fix to handle post-checkout authentication
const GitHubAuthRedirect = () => {
 // Fix: Check if the redirect is due to a successful checkout before forcing GitHub auth
 const urlParams = new URLSearchParams(window.location.search);
 const purchaseSuccess = urlParams.get('purchase') === 'success';
 
 if (purchaseSuccess) {
   // If coming from a successful purchase, redirect to dashboard using absolute custom domain URL
   window.location.href = 'https://www.devhubconnect.com/dashboard';
 } else {
   // Proceed with GitHub authentication for initial login/register using absolute custom domain URL
   window.location.href = 'https://www.devhubconnect.com/auth/github';
 }
 
 return <div>Redirecting to {purchaseSuccess ? 'dashboard' : 'GitHub authentication'}...</div>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/template/:id" element={<TemplateDetail />} />
              <Route path="/guidance" element={<GuidancePage />} />
              <Route path="/success" element={<SuccessPage />} />
              
              {/* Legal Pages */}
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />

              {/* Authentication Routes - Redirect to GitHub OAuth with fix */}
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

            <Footer />
          </>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;