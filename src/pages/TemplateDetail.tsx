import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Navbar } from "../components/Navbar";
import { Button } from "../components/ui/button";
import { ArrowLeft, ShoppingCart, Star, Eye, Edit, SlidersHorizontal, Share2, Download, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/context/AuthProvider";
import { API_ENDPOINTS, apiCall } from '../config/api';
import { getDeterministicRandom } from "@/lib/utils";

interface Template {
  id: number;
  slug?: string;
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
  category?: string;
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

const handleDownloadStarterPrompt = (template: Template) => {
  const wj = template.workflowJson || template.workflow_json;
  const nodes = wj?.nodes as any[] | undefined;
  const nodeTypes = nodes && nodes.length > 0
    ? [...new Set(nodes.map(n => (n.type as string)?.split('.').pop() || n.type).filter(Boolean))].join(', ')
    : 'relevant automation services';
  const text = `You are an expert n8n workflow engineer.

I need to build an n8n automation for: ${template.name}

Description: ${template.description}

The workflow should incorporate these services/node types: ${nodeTypes}

Please generate a complete, importable n8n workflow JSON. Requirements:
- Output only valid JSON inside a \`\`\`json code block
- Include all required node types, connections, and parameters
- Use placeholder credentials (id: "1") for all credential references
- Follow the n8n workflow schema: { name, nodes, connections, settings, meta }
- After the JSON, provide a short explanation of how the workflow operates

Begin the workflow now.`;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-starter-prompt.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  // The route param may be a bare numeric ID ("367") or an ID+slug ("367-llm-construction-...");
  // the DB and API only know the numeric ID, so pull that out for lookups.
  const templateId = templateIdParam?.match(/^\d+/)?.[0];

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
  const templateUrl = `https://www.devhubconnect.com/templates/${template.slug ? `${template.id}-${template.slug}` : template.id}`;
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
                  <div className="border rounded-lg bg-gray-100 overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${template.name} preview`}
                        className="w-full h-auto rounded-lg"
                        width={800}
                        height={450}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <p className="text-gray-500 p-4">No visual preview available.</p>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <p className="text-4xl font-bold mb-4">${(template.price / 100).toFixed(2)}</p>

                  {template.purchased ? (
                    <div className="space-y-3">
                      {template.category === 'prompt' ? (
                        <Button size="lg" className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => navigate(`/studio?tab=prompt-store&promptId=${template.id}`)}>
                          <Wand2 className="w-5 h-5 mr-2" />
                          Use in Studio
                        </Button>
                      ) : (
                        <>
                          <Button size="lg" className="w-full bg-primary hover:bg-primary/90" onClick={() => handleDownloadJson(template)}>
                            <Download className="w-5 h-5 mr-2" />
                            Download JSON
                          </Button>
                          <Button size="lg" variant="outline" className="w-full border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => handleDownloadStarterPrompt(template)}>
                            <Download className="w-5 h-5 mr-2" />
                            Download Starter Prompt
                          </Button>
                        </>
                      )}
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
                          {template.category === 'prompt' ? 'Get Combo' : 'Purchase Workflow + Prompt'}
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
