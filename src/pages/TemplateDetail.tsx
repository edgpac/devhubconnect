import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Navbar } from "../components/Navbar";
import { Button } from "../components/ui/button";
import { ArrowLeft, ShoppingCart, Star, Eye, Edit, SlidersHorizontal, Share2, Download, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/context/AuthProvider";
import { API_ENDPOINTS, apiCall } from '../config/api';

import { getDeterministicRandom } from "@/lib/utils";
import { loadStripe } from '@stripe/stripe-js';

// REPLACE WITH YOUR ACTUAL STRIPE PUBLISHABLE KEY
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51RgVfSBS72lorg0VlXnIXjmsGBjriHLK36isBNmKnsbYjkHmTkz6Rp0hK0QboFaJLnzl0qA2FyLMq3hA5ofFEneN005HATkECJ');

interface Template {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  image_url?: string;
  workflowJson?: { nodes?: { id: string; name: string; type: string }[] };
  workflow_json?: { nodes?: { id: string; name: string; type: string }[] };
  steps?: number;
  integratedApps?: string[];
  workflowDetails?: {
    steps: number;
    apps: string[];
    hasWorkflow: boolean;
  };
  purchased?: boolean;
  isOwner?: boolean;
  hasAccess?: boolean;
}

const handleDownloadJson = (template: Template) => {
    if (!template.workflowJson && !template.workflow_json) return;
    const downloadUrl = `/api/templates/${template.id}/download-workflow`;
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${template.name.toLowerCase().replace(/\s+/g, '_')}_workflow.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const getIntegratedApps = (nodes: { type: string }[] | undefined): string[] => {
  if (!nodes) return [];
  const appTypes = nodes.map(node => {
    const parts = node.type.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  });
  return Array.from(new Set(appTypes));
};

async function fetchTemplateById(id: string | undefined): Promise<Template> {
  if (!id || id.trim() === '') throw new Error("No template ID provided");
  
  const response = await apiCall(API_ENDPOINTS.TEMPLATE_BY_ID(id), {
    method: 'GET',
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Template with ID "${id}" not found`);
    }
    throw new Error("Failed to fetch template details.");
  }
  const data = await response.json();
  return data.template;
}

export const TemplateDetail = () => {
  const { id: templateIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const { currentUser } = useAuth();

  const templateId = templateIdParam;

  // ✅ FIX: Smart back button that preserves pagination and handles Stripe returns
  const handleBackToTemplates = () => {
    // Try to get the last page from sessionStorage
    const lastPage = sessionStorage.getItem('lastTemplatePage');
    
    // Check if we came from Stripe (checkout.stripe.com in the referrer)
    const cameFromStripe = document.referrer.includes('checkout.stripe.com');
    
    if (cameFromStripe && lastPage) {
      // If returning from Stripe, use sessionStorage to go to the saved page
      navigate(`/?page=${lastPage}`);
    } else if (window.history.length > 1 && !cameFromStripe) {
      // If there's history and we didn't come from Stripe, use browser back
      navigate(-1);
    } else if (lastPage) {
      // Fallback to sessionStorage
      navigate(`/?page=${lastPage}`);
    } else {
      // Final fallback to homepage
      navigate('/');
    }
  };

  if (!templateId || templateId.trim() === '') {
    return <div className="text-center p-12 text-red-500">Error: No template ID provided in URL.</div>;
  }

  const { data: template, isLoading, error } = useQuery<Template>({
    queryKey: ["template", templateId],
    queryFn: () => fetchTemplateById(templateId),
  });
   
  if (isLoading) return <div className="text-center p-12">Loading Marketplace...</div>;
  if (error) return <div className="text-center p-12 text-red-500">Error: {(error as Error).message}</div>;
  if (!template) return <div className="text-center p-12">Template not found.</div>;

  const imageUrl = template.imageUrl || template.image_url;

  console.log('🔍 Template Debug Info:', {
    templateId: template.id,
    templateName: template.name,
    imageUrl: template.imageUrl,
    image_url: template.image_url,
    finalImageUrl: imageUrl,
    workflowJson: template.workflowJson,
    workflow_json: template.workflow_json,
    hasImageUrl: !!imageUrl,
    imageUrlType: typeof imageUrl,
    imageUrlLength: imageUrl?.length
  });

  const deterministicReviewCount = getDeterministicRandom(String(template.id), 16, 92);
  const deterministicViewsCount = getDeterministicRandom(String(template.id) + "-views", 300, 1500);
  const deterministicRating = (4 + getDeterministicRandom(String(template.id) + "-rating", 1, 9) / 10).toFixed(1);

  const workflowNodes = template.workflowJson?.nodes || template.workflow_json?.nodes;
  const integratedApps = template.integratedApps || template.workflowDetails?.apps || getIntegratedApps(workflowNodes);
  const stepCount = template.steps || template.workflowDetails?.steps || workflowNodes?.length || 0;

  const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || false;

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      const stripe = await stripePromise;
      if (!stripe) {
        console.error("Stripe.js failed to load.");
        toast.error("Payment system not available. Please try again later.", { description: "Stripe.js failed to load." });
        return;
      }

      const response = await apiCall(API_ENDPOINTS.CREATE_CHECKOUT, {
        method: 'POST',
        body: JSON.stringify({ templateId: template.id }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error response:", errorText);
        throw new Error(`Failed to create checkout session. Server responded with: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 100)}...`);
      }

      const session = await response.json();

      window.location.href = session.url;

    } catch (error) {
      console.error("Error during purchase:", error);
      toast.error("Purchase failed", { description: (error as Error).message });
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <HelmetProvider>
      <>
        <Helmet>
            <title>{template.name} | DevHubConnect</title>
        </Helmet>
         
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
              {/* ✅ FIXED: Smart back button that handles Stripe returns and preserves pagination */}
              <button 
                onClick={handleBackToTemplates} 
                className="text-primary hover:underline flex items-center cursor-pointer bg-transparent border-none p-0"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to All Templates
              </button>
              {isAdmin && (
                <button onClick={() => navigate(`/admin/templates/${templateId}/edit`)}>
                  <Button variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Template
                  </Button>
                </button>
              )}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <h1 className="text-3xl font-bold mb-4">{template.name}</h1>
                  <p className="text-gray-600 mb-6">{template.description}</p>
                  <h2 className="text-xl font-semibold mb-4">Visual Preview</h2>
                  <div className="p-4 border rounded-lg bg-gray-100 flex justify-center items-center">
                    {imageUrl ? (
                      <img 
                        src={imageUrl} 
                        alt={`${template.name} preview`} 
                        className="max-w-full h-auto rounded-md"
                        onLoad={() => console.log('✅ Image loaded successfully:', imageUrl)}
                        onError={(e) => {
                          console.error('❌ Image failed to load:', imageUrl);
                          console.error('Error details:', e);
                        }}
                      />
                    ) : (
                      <div>
                        <p className="text-gray-500">No visual preview available.</p>
                        <p className="text-xs text-gray-400 mt-2">Debug: imageUrl = "{template.imageUrl}", image_url = "{template.image_url}"</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <p className="text-4xl font-bold mb-4">${(template.price / 100).toFixed(2)}</p>

                  {template.purchased ? (
                    <div className="space-y-3">
                      <Button size="lg" className="w-full bg-primary hover:bg-primary/90" onClick={() => handleDownloadJson(template)}>
                        <Download className="w-5 h-5 mr-2" />
                        Download JSON
                      </Button>
                      <Button size="lg" variant="secondary" className="w-full" onClick={() => alert('Logic to copy workflow to be implemented!')}>
                        <Copy className="w-5 h-5 mr-2" />
                        Copy to My Workflows
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full bg-primary hover:bg-primary/90"
                      onClick={handlePurchase}
                      disabled={isPurchasing}
                    >
                      {isPurchasing ? "Redirecting to Checkout..." : (
                        <>
                          <ShoppingCart className="w-5 h-5 mr-2" />
                          Purchase JSON Template
                        </>
                      )}
                    </Button>
                  )}
                   
                  <p className="text-center text-xs text-gray-500 mt-3">
                    ✅ Instant download after purchase
                  </p>
                   
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Workflow Details</h3>
                    <div className="mb-4">
                        <div className="flex items-center text-sm font-semibold text-gray-600 mb-3">
                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                            Steps Included
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {stepCount > 0 ? (
                                <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                                    {stepCount} steps in workflow
                                </span>
                            ) : (
                                <p className="text-xs text-gray-500">No steps defined.</p>
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center text-sm font-semibold text-gray-600 mb-3">
                            <Share2 className="w-4 h-4 mr-2" />
                            Integrated Apps
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {integratedApps && integratedApps.length > 0 ? (
                                integratedApps.map((appType) => (
                                    <span key={appType} className="bg-blue-100 text-blue-800 text-xs font-medium capitalize px-2.5 py-1 rounded-full">
                                        {appType}
                                    </span>
                                ))
                            ) : (
                               <p className="text-xs text-gray-500">No specific app integrations.</p>
                            )}
                        </div>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-3 text-sm text-gray-700 pt-6 border-t">
                    <li key="reviews" className="flex items-center">
                        <Star className="w-4 h-4 mr-2 text-yellow-500" />
                        {deterministicRating} ({deterministicReviewCount} reviews)
                    </li>
                    <li key="views" className="flex items-center">
                        <Eye className="w-4 h-4 mr-2 text-gray-500" />
                        {deterministicViewsCount}+ views
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </main>
        </div>
      </>
    </HelmetProvider>
  );
};