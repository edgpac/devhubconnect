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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <>
            <Routes>
              {/* Main Application Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/template/:id" element={<TemplateDetail />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="/auth/success" element={<AuthSuccess />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/guidance" element={<GuidancePage />} />
              <Route path="/success" element={<SuccessPage />} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

              {/* Legal Pages */}
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />

              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route
                path="/admin/analytics"
                element={
                  <ProtectedRoute>
                    <Analytics />
                  </ProtectedRoute>
                }
              />
              
              {/* ✅ ADDED: Admin template edit route */}
              <Route
                path="/admin/templates/:id/edit"
                element={
                  <ProtectedRoute>
                    <TemplateEdit />
                  </ProtectedRoute>
                }
              />
              
              {/* Keep the old route for backward compatibility */}
              <Route
                path="/template/:id/edit"
                element={
                  <ProtectedRoute>
                    <TemplateEdit />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all route */}
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