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

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'ofFEne');

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

  // ✅ YOUR FIX: Read saved page at the top
  const lastPage = sessionStorage.getItem("lastTemplatePage") || "1";

  // ✅ YOUR FIX: Back button handler uses saved page
  const handleBackToTemplates = () => {
    navigate(`/?page=${lastPage}`);
  };

  if (!templateId || templateId.trim() === '') {
    return <div className="text-center p-12 text-red-500">Error: No template ID provided in URL.</div>;
  }

  // ✅ SSR: Use server-injected data to prevent Google WRS soft 404
  // When SSR data exists, skip the API call entirely (Google's renderer can't reach our API)
  const ssrData = typeof window !== 'undefined' && (window as any).__SSR_TEMPLATE__;
  const ssrInitialData = ssrData && String(ssrData.id) === templateId ? ssrData as Template : undefined;

  const { data: template, isLoading, error } = useQuery<Template>({
    queryKey: ["template", templateId],
    queryFn: () => fetchTemplateById(templateId),
    initialData: ssrInitialData,
    staleTime: ssrInitialData ? Infinity : 0,
    retry: ssrInitialData ? false : 3,
    enabled: !ssrInitialData,
  });

  if (isLoading && !ssrInitialData) return <div className="text-center p-12">Loading Marketplace...</div>;
  if (error && !template) return <div className="text-center p-12 text-red-500">Error: {(error as Error).message}</div>;
  if (!template) return <div className="text-center p-12">Template not found.</div>;

  const imageUrl = template.imageUrl || template.image_url;

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
        toast.error("Payment system not available. Please try again later.");
        return;
      }

      const response = await apiCall(API_ENDPOINTS.CREATE_CHECKOUT, {
        method: 'POST',
        body: JSON.stringify({ templateId: template.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const session = await response.json();
      window.location.href = session.url;

    } catch (error) {
      toast.error("Purchase failed", { description: (error as Error).message });
    } finally {
      setIsPurchasing(false);
    }
  };

  // ✅ SEO: Build dynamic meta tags with CTR-optimized format
  const priceDisplay = template.price === 0 ? 'Free' : `$${(template.price / 100).toFixed(2)}`;
  const metaTitle = `${template.name} | n8n Template ${priceDisplay !== 'Free' ? `– ${priceDisplay}` : '(Free)'} | DevHubConnect`;
  const autoDescription = `${template.name}${stepCount > 0 ? ` — ${stepCount}-step` : ''} n8n automation${integratedApps.length > 0 ? ` with ${integratedApps.slice(0, 3).join(', ')}` : ''}. ${priceDisplay === 'Free' ? 'Free download' : `Only ${priceDisplay}`} — instant access, ready to import.`;
  const metaDescription = (template as any).metaDescription || autoDescription;
  const templateUrl = `https://www.devhubconnect.com/templates/${template.id}`;
  const priceValue = (template.price / 100).toFixed(2);

  return (
    <HelmetProvider>
      <>
        <Helmet>
            {/* Primary Meta Tags */}
            <title>{metaTitle}</title>
            <meta name="title" content={metaTitle} />
            <meta name="description" content={metaDescription} />
            
            {/* Open Graph / Facebook */}
            <meta property="og:type" content="product" />
            <meta property="og:url" content={templateUrl} />
            <meta property="og:title" content={metaTitle} />
            <meta property="og:description" content={metaDescription} />
            {imageUrl && <meta property="og:image" content={imageUrl} />}
            <meta property="og:site_name" content="DevHubConnect" />
            
            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={templateUrl} />
            <meta name="twitter:title" content={metaTitle} />
            <meta name="twitter:description" content={metaDescription} />
            {imageUrl && <meta name="twitter:image" content={imageUrl} />}
            
            {/* Structured Data - Product Schema */}
            <script type="application/ld+json">
              {JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                "name": template.name,
                "description": template.description,
                "image": imageUrl || "https://www.devhubconnect.com/placeholder.svg",
                "url": templateUrl,
                "offers": {
                  "@type": "Offer",
                  "url": templateUrl,
                  "priceCurrency": "USD",
                  "price": priceValue,
                  "availability": "https://schema.org/InStock",
                  "seller": {
                    "@type": "Organization",
                    "name": "DevHubConnect"
                  }
                },
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": deterministicRating,
                  "reviewCount": deterministicReviewCount,
                  "bestRating": "5",
                  "worstRating": "1"
                },
                "brand": {
                  "@type": "Brand",
                  "name": "DevHubConnect"
                },
                "category": "Software > Automation Tools"
              })}
            </script>
            
            {/* Canonical URL */}
            <link rel="canonical" href={templateUrl} />
        </Helmet>
         
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
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
                      />
                    ) : (
                      <p className="text-gray-500">No visual preview available.</p>
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
                      <Button size="lg" variant="secondary" className="w-full" onClick={() => toast.info('Coming soon!')}>
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
                            <Share2 className="w-4 w-4 mr-2" />
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
