import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Download, ShoppingCart, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDeterministicRandom } from "@/lib/utils";
import { useState } from "react";

interface Template {
 id: number;
 name: string;
 description: string;
 price: number;
 imageUrl?: string;
 image_url?: string; // ✅ ADD: Backend field name
 workflowJson?: any;
 workflow_json?: any; // ✅ ADD: Backend field name
 createdAt?: string;
 created_at?: string; // ✅ ADD: Backend field name
 downloads?: number;
 downloadCount?: number;
 purchased?: boolean;
 _rating?: number;
 _reviewCount?: number;
 _tags?: string[];
}

interface TemplateCardProps {
 template: Template;
 onPreview?: (template: Template) => void;
}

export const TemplateCard = ({ template, onPreview }: TemplateCardProps) => {
 const navigate = useNavigate();
 const [isDownloading, setIsDownloading] = useState(false);
 
 // ✅ MAIN FIX: Handle both field name formats for image
 const imageUrl = template.imageUrl || template.image_url || null;
 
 // Generate deterministic fake numbers if real data isn't available
 const downloadCount = template.downloads || template.downloadCount || 
   getDeterministicRandom(String(template.id) + "-downloads", 45, 850);
 
 const rating = template._rating || 
   (4 + getDeterministicRandom(String(template.id) + "-rating", 1, 9) / 10);
 
 const reviewCount = template._reviewCount || 
   getDeterministicRandom(String(template.id) + "-reviews", 8, 120);

 const handlePreview = () => {
   // Navigate to the template detail page
   navigate(`/template/${template.id}`);
 };

 const handlePurchase = () => {
   // Navigate to template detail page where they can purchase
   navigate(`/template/${template.id}`);
 };

 // ✅ Real download functionality with DEBUG logging
 const handleDownload = async () => {
   // ✅ DEBUG: Template object analysis
   console.log('🐛 DEBUG: Full template object:', template);
   console.log('🐛 DEBUG: Template ID:', template.id);
   console.log('🐛 DEBUG: Template ID type:', typeof template.id);
   console.log('🐛 DEBUG: Template purchased:', template.purchased);
   console.log('🐛 DEBUG: Image URL resolved to:', imageUrl);

   if (!template.purchased) {
     handlePurchase();
     return;
   }

   // ✅ Validation
   if (template.id === undefined || template.id === null) {
     console.error('❌ Template ID is undefined or invalid');
     alert('Error: Template ID is missing');
     return;
   }

   setIsDownloading(true);
   try {
     const downloadUrl = `/api/templates/${template.id}/download`;
     console.log('🐛 DEBUG: Download URL:', downloadUrl);

     const response = await fetch(downloadUrl, {
       credentials: 'include',
     });

     if (!response.ok) {
       if (response.status === 401) {
         throw new Error('Please sign in to download templates');
       } else if (response.status === 403) {
         throw new Error('Template not purchased');
       } else {
         throw new Error('Failed to download template');
       }
     }

     // Get the filename from the response headers
     const contentDisposition = response.headers.get('Content-Disposition');
     let filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
     
     if (contentDisposition) {
       const filenameMatch = contentDisposition.match(/filename="(.+)"/);
       if (filenameMatch) {
         filename = filenameMatch[1];
       }
     }

     // Create blob and download
     const blob = await response.blob();
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = filename;
     document.body.appendChild(a);
     a.click();
     window.URL.revokeObjectURL(url);
     document.body.removeChild(a);

     console.log('✅ Template downloaded:', template.name);
   } catch (error: any) {
     console.error('Download error:', error);
     alert(`Download failed: ${error.message}`);
   } finally {
     setIsDownloading(false);
   }
 };

 return (
   <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-200">
     {/* Template Image */}
     <div className="relative overflow-hidden rounded-t-lg">
       {/* ✅ MAIN FIX: Use the resolved imageUrl variable */}
       {imageUrl ? (
         <img 
           src={imageUrl} 
           alt={template.name}
           className="w-full h-48 object-cover transition-transform duration-300 ease-in-out hover:scale-110"
           onError={(e) => {
             // ✅ BONUS: Fallback if image fails to load
             console.log('🐛 DEBUG: Image failed to load:', imageUrl);
             e.currentTarget.style.display = 'none';
             e.currentTarget.parentElement?.querySelector('.image-fallback')?.classList.remove('hidden');
           }}
         />
       ) : null}
       
       {/* ✅ Always show fallback div, hide it when image loads successfully */}
       <div className={`w-full h-48 bg-gray-100 flex items-center justify-center transition-transform duration-300 ease-in-out hover:scale-110 image-fallback ${imageUrl ? 'hidden' : ''}`}>
         <div className="text-center text-gray-400">
           <div className="text-4xl mb-2">📋</div>
           <div className="text-sm">Workflow Preview</div>
           {/* ✅ DEBUG: Show what image URL we tried to load */}
           {process.env.NODE_ENV === 'development' && (
             <div className="text-xs mt-2 px-2 py-1 bg-red-100 text-red-600 rounded">
               DEBUG: {imageUrl || 'No image URL found'}<br/>
               Fields checked: imageUrl={template.imageUrl || 'undefined'}, image_url={template.image_url || 'undefined'}
             </div>
           )}
         </div>
       </div>
       
       {/* Price Badge */}
       <div className="absolute top-3 right-3 z-10">
         <Badge variant="secondary" className="bg-white/90 text-gray-800 font-semibold">
           {Number(template.price) === 0 
             ? 'Free' 
             : `$${(Number(template.price) / 100).toFixed(2)}`}
         </Badge>
       </div>
     </div>

     <CardHeader className="pb-3">
       <CardTitle className="text-lg font-semibold line-clamp-2 min-h-[3.5rem]">
         {template.name}
       </CardTitle>
     </CardHeader>
     
     <CardContent className="flex-1 flex flex-col justify-between">
       {/* Description */}
       <p className="text-sm text-gray-600 line-clamp-3 mb-4">
         {template.description}
       </p>
       
       {/* Stats Row */}
       <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
         <div className="flex items-center space-x-1">
           <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
           <span className="font-medium">{rating.toFixed(1)}</span>
           {reviewCount > 0 && <span className="text-gray-400">({reviewCount})</span>}
         </div>
         <div className="flex items-center space-x-1">
           <Download className="h-4 w-4" />
           <span className="font-medium">{downloadCount.toLocaleString()}</span>
         </div>
       </div>
       
       {/* Action Buttons */}
       <div className="space-y-2">
         <Button 
           className={`w-full ${
             template.purchased 
               ? "border-gray-300 text-gray-700 hover:bg-gray-50" 
               : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg"
           }`}
           variant={template.purchased ? "outline" : "default"}
           onClick={handleDownload}
           disabled={isDownloading}
         >
           {isDownloading ? (
             <>
               <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
               Downloading...
             </>
           ) : template.purchased ? (
             <>
               <Download className="h-4 w-4 mr-2" />
               Download
             </>
           ) : (
             <>
               <ShoppingCart className="h-4 w-4 mr-2" />
               Purchase JSON Template
             </>
           )}
         </Button>
         
         <Button 
           variant="outline" 
           size="sm" 
           className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
           onClick={handlePreview}
         >
           <Eye className="h-4 w-4 mr-2" />
           View Preview
         </Button>
       </div>
     </CardContent>
   </Card>
 );
};