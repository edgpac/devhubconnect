import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Navbar } from '../components/Navbar';
import { TemplateCard } from '../components/TemplateCard';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
 Pagination,
 PaginationContent,
 PaginationItem,
 PaginationLink,
 PaginationNext,
 PaginationPrevious,
 PaginationEllipsis,
} from '../components/ui/pagination';
import {
 Search,
 Filter,
 TrendingUp,
 Zap,
 ChevronsUpDown,
} from 'lucide-react';
import StudioTeaser from '../components/StudioTeaser';
import { API_ENDPOINTS, apiCall } from '../config/api';
import { getSessionSeed, seededShuffle } from '@/lib/utils';

interface Template {
 id: number;
 name: string;
 description: string;
 price: number;
 workflowJson: any;
 createdAt: string;
 downloads: number;
 purchased?: boolean;
}

const fetchTemplates = async (): Promise<Template[]> => {
 const response = await apiCall(API_ENDPOINTS.TEMPLATES);
 if (!response.ok) {
   throw new Error('Network response was not ok');
 }
 const data = await response.json();
 return data.templates;
};

const trackSearch = async (searchTerm: string) => {
 try {
   await fetch('/api/templates/analytics/search', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ 
       searchTerm, 
       timestamp: new Date().toISOString() 
     })
   });
 } catch (error) {
   console.log('Search analytics tracking failed:', error);
 }
};

const trackTemplateView = async (templateId: number) => {
 try {
   await fetch(`/api/templates/analytics/view/${templateId}`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' }
   });
 } catch (error) {
   console.log('View analytics tracking failed:', error);
 }
};

const getPaginationItems = (
 currentPage: number,
 totalPages: number,
 siblingCount = 1
): (number | string)[] => {
 const totalPageNumbersToShow = siblingCount * 2 + 5;

 const fixedJumpPages = [20, 40, 60, 80, 100].filter(page => page < totalPages);

 if (totalPages <= totalPageNumbersToShow && totalPages > 0) {
   return Array.from({ length: totalPages }, (_, i) => i + 1);
 } else if (totalPages === 0) {
   return [];
 }

 const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
 const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

 const shouldShowLeftDots = leftSiblingIndex > 2;
 const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

 const firstPageIndex = 1;
 const lastPageIndex = totalPages;

 let itemsSet = new Set<number>();
 itemsSet.add(firstPageIndex);
 itemsSet.add(lastPageIndex);

 for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
   itemsSet.add(i);
 }

 itemsSet.add(currentPage);

 fixedJumpPages.forEach(page => itemsSet.add(page));

 let sortedItems = Array.from(itemsSet).sort((a, b) => a - b);

 const finalItems: (number | string)[] = [];
 let lastAddedItem: number | string | null = null;

 for (const item of sortedItems) {
   if (lastAddedItem !== null && typeof lastAddedItem === 'number' && item > lastAddedItem + 1) {
     finalItems.push('...');
   }
   finalItems.push(item);
   lastAddedItem = item;
 }

 return finalItems;
};

export const HomePage = () => {
 const { data: templates = [], isLoading, error } = useQuery<Template[]>({
   queryKey: ['templates'],
   queryFn: fetchTemplates,
 });

 const [searchParams] = useSearchParams();
 const navigate = useNavigate();

 const sessionSeed = useMemo(() => getSessionSeed(), []);

 const [searchTerm, setSearchTerm] = useState('');
 const [selectedCategory, setSelectedCategory] = useState('all');
 const [sortOrder, setSortOrder] = useState('all');
 
 // ✅ Initialize page state from URL
 const [page, setPage] = useState(() => {
   const urlPage = searchParams.get("page");
   return urlPage ? Number(urlPage) : 1;
 });

 // ✅ Sync page when URL changes (refresh, back button, deep link)
 useEffect(() => {
   const urlPage = searchParams.get("page");
   if (urlPage && Number(urlPage) !== page) {
     setPage(Number(urlPage));
   }
 }, [searchParams]);

 const templatesPerPage = 9;

 useEffect(() => {
   const params = new URLSearchParams(searchParams);
   if (page !== 1) {
     params.set('page', page.toString());
   } else {
     params.delete('page');
   }
   navigate(`?${params.toString()}`, { replace: true });
 }, [page, navigate]);

 const categories = [
   'all',
   'popular',
   'email',
   'database',
   'webhooks',
   'social',
   'marketing',
 ];

 const processedTemplates = useMemo(() => {
 // Shuffle base order once per session so users see different templates each visit
 let filtered: Template[] = seededShuffle(Array.isArray(templates) ? templates : [], sessionSeed);

 if (selectedCategory === 'popular') {
   filtered = filtered.filter((template) =>
     template.description.toLowerCase().includes('llm') ||
     template.name.toLowerCase().includes('llm')
   );

   filtered.sort((a, b) => b.downloads - a.downloads);
   return filtered;
 }

 if (selectedCategory !== 'all') {
   filtered = filtered.filter(
     (template) =>
       template.description.toLowerCase().includes(selectedCategory.toLowerCase()) ||
       template.name.toLowerCase().includes(selectedCategory.toLowerCase())
   );
 }

 if (searchTerm) {
   filtered = filtered.filter(
     (template) =>
       template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       template.description.toLowerCase().includes(searchTerm.toLowerCase())
   );
 }

 const sorted = [...filtered];
 switch (sortOrder) {
   case 'popular':
     sorted.sort((a, b) => b.downloads - a.downloads);
     break;
   case 'newest':
     sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
     break;
   case 'price_asc':
     sorted.sort((a, b) => a.price - b.price);
     break;
   case 'price_desc':
     sorted.sort((a, b) => b.price - a.price);
     break;
   default:
     break;
 }

 return sorted;
}, [templates, selectedCategory, searchTerm, sortOrder]);

 const totalPages = Math.ceil(processedTemplates.length / templatesPerPage);

 useEffect(() => {
   if (page > totalPages && totalPages > 0) {
     setPage(totalPages);
   }
   else if (totalPages === 0 && page !== 1) {
     setPage(1);
   }
 }, [page, totalPages]);

 const startIndex = (page - 1) * templatesPerPage;
 const endIndex = startIndex + templatesPerPage;
 const currentTemplates = processedTemplates.slice(startIndex, endIndex);
 const paginationItems = getPaginationItems(page, totalPages);

 const handleFilterChange = (category: string) => {
   if (category === 'popular') {
     setSortOrder('popular');
   } else if (sortOrder === 'popular') {
     setSortOrder('newest');
   }
   setSelectedCategory(category);
   setPage(1);
 };

 const handleSortChange = (value: string) => {
   setSortOrder(value);
   setPage(1);
 };

 const handleSearchChange = (value: string) => {
   setSearchTerm(value);
   setPage(1);
   if (value.trim()) {
     trackSearch(value.trim());
   }
 };

 const handleTemplateClick = (templateId: number) => {
   trackTemplateView(templateId);
   navigate(`/template/${templateId}`);
 };

 return (
   <HelmetProvider>
     <>
       <Helmet>
         <title>n8n AI Workflow Builder & JSON Prompt Studio | DevHubConnect</title>
         <meta
           name="description"
           content="Build and customize n8n workflows with Claude AI. Get 588+ ready-to-import JSON templates, or describe your automation in plain English and let AI generate the workflow for you."
         />
         <link rel="canonical" href="https://www.devhubconnect.com/" />

         {/* Open Graph Tags */}
         <meta property="og:title" content="n8n AI Workflow Builder & JSON Prompt Studio | DevHubConnect" />
         <meta property="og:description" content="Build and customize n8n workflows with Claude AI. 588+ JSON templates plus an AI studio that generates workflows from plain English." />
         <meta property="og:url" content="https://www.devhubconnect.com/" />
         <meta property="og:type" content="website" />
         <meta property="og:image" content="https://www.devhubconnect.com/og-image.png" />

         {/* Twitter Card Tags */}
         <meta name="twitter:card" content="summary_large_image" />
         <meta name="twitter:title" content="n8n AI Workflow Builder & JSON Prompt Studio | DevHubConnect" />
         <meta name="twitter:description" content="Build and customize n8n workflows with Claude AI. 588+ JSON templates plus an AI studio that generates workflows from plain English." />
         <meta name="twitter:image" content="https://www.devhubconnect.com/og-image.png" />
       </Helmet>

       <div className="min-h-screen bg-gray-50">
         <Navbar />
        <main id="main-content">

         {/* Hero Section */}
         <section className="bg-gradient-to-br from-gray-950 via-teal-950 to-gray-900 text-white py-20">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

             {/* Badge */}
             <div className="inline-flex items-center gap-2 bg-teal-500 bg-opacity-20 border border-teal-400 border-opacity-30 text-teal-300 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
               <Zap className="w-3.5 h-3.5" />
               Claude AI — trained on n8n’s exact JSON schema
             </div>

             <h1 className="text-5xl font-bold mb-5 leading-tight">
               The Prompts That Make Claude<br />
               <span className="text-teal-400">Build Real n8n Workflows</span>
             </h1>

             <p className="text-lg mb-4 text-gray-300 max-w-2xl mx-auto">
               Claude can write workflows. DevHubConnect makes them production-safe.<br />
               Powered by expert prompt architecture and 588 MCP-audited templates, our Claude AI Studio understands n8n structurally — from an MCP perspective, not just syntactically.
             </p>
             <p className="text-sm mb-10 text-teal-400/60 max-w-xl mx-auto font-mono tracking-wide">
               No broken triggers. No orphan graphs. No fragile AI wiring.
             </p>
             {/* CTA */}
             <div className="flex items-center justify-center mb-14">
               <a href="/studio">
                 <button className="px-8 py-3.5 bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-400 transition-colors flex items-center gap-2 text-base">
                   <Zap className="w-4 h-4" /> Try the Workflow Studio Free
                 </button>
               </a>
             </div>

             {/* Stats */}
             <div className="flex justify-center gap-12 text-center">
               <div className="flex flex-col items-center">
                 <span className="text-3xl font-bold text-white">588+</span>
                 <span className="text-gray-400 text-sm mt-1">Templates</span>
               </div>
               <div className="w-px bg-white bg-opacity-10" />
               <div className="flex flex-col items-center">
                 <span className="text-3xl font-bold text-white">7,000+</span>
                 <span className="text-gray-400 text-sm mt-1">Users</span>
               </div>
               <div className="w-px bg-white bg-opacity-10" />
               <div className="flex flex-col items-center">
                 <span className="text-3xl font-bold text-white">4.9</span>
                 <span className="text-gray-400 text-sm mt-1">Rating</span>
               </div>
             </div>

           </div>
         </section>

         {/* Search and Filters */}
         <section className="py-8 bg-white border-b sticky top-0 z-10">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
               <div className="relative flex-1 w-full md:max-w-xs">
                 <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                 <Input
                   placeholder="Search templates..."
                   className="pl-10"
                   value={searchTerm}
                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
                 />
               </div>

               <div className="flex items-center gap-2 overflow-x-auto">
                 <Filter className="h-4 w-4 text-gray-500 flex-shrink-0" />
                 {categories.map((category) => (
                   <Badge
                     key={category}
                     variant={selectedCategory === category ? 'default' : 'outline'}
                     className="cursor-pointer hover:bg-teal-100 transition-colors capitalize whitespace-nowrap"
                     onClick={() => handleFilterChange(category)}
                   >
                     {category === 'popular' && <TrendingUp className="w-3 h-3 mr-1.5" />}
                     {category}
                   </Badge>
                 ))}
               </div>

               <div className="flex items-center space-x-2">
                 <ChevronsUpDown className="h-4 w-4 text-gray-500" />
                 <Select value={sortOrder} onValueChange={handleSortChange}>
                   <SelectTrigger className="w-[180px]" aria-label="Sort templates by">
                     <SelectValue placeholder="Sort by" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="popular">Popularity</SelectItem>
                     <SelectItem value="newest">Newest</SelectItem>
                     <SelectItem value="price_asc">Price: Low to High</SelectItem>
                     <SelectItem value="price_desc">Price: High to Low</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
             </div>
           </div>
         </section>

         {/* Templates Grid */}
         <section id="templates" className="py-12">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             <div className="flex items-center justify-between mb-8">
               <h2 className="text-3xl font-bold text-gray-900">Available Templates</h2>
               {!isLoading && !error && (
                 <div className="flex items-center text-gray-600">
                   <Zap className="w-5 h-5 mr-2" />
                   <span>{processedTemplates.length} templates found</span>
                 </div>
               )}
             </div>

             {isLoading && (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {Array.from({ length: 6 }).map((_, i) => (
                   <div key={i} className="h-72 bg-gray-100 rounded-xl animate-pulse" />
                 ))}
               </div>
             )}

             {error && !isLoading && (
               <div className="text-center py-16 text-gray-500">
                 <p className="text-lg font-medium mb-2">Templates are loading…</p>
                 <p className="text-sm">Please refresh the page in a moment.</p>
               </div>
             )}

             {!isLoading && !error && (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {currentTemplates.map((template) => (
                   <TemplateCard
                     key={template.id}
                     template={template}
                   />
                 ))}
               </div>
             )}

             {!isLoading && !error && processedTemplates.length === 0 && (
               <div className="text-center py-16">
                 <div className="text-gray-400 text-6xl mb-4">🔍</div>
                 <h3 className="text-xl font-semibold text-gray-900 mb-2">No templates found</h3>
                 <p className="text-gray-600">Try adjusting your search terms or filters</p>
                 <Button
                   variant="outline"
                   className="mt-4"
                   onClick={() => {
                     setSearchTerm('');
                     setSelectedCategory('all');
                     setPage(1);
                   }}
                 >
                   Clear Filters
                 </Button>
               </div>
             )}

             {/* Pagination */}
             {totalPages > 1 && (
               <div className="mt-12 flex justify-center">
                 <Pagination>
                   <PaginationContent>
                     <PaginationItem>
                       <PaginationPrevious
                         href={`?page=${page - 1}`}
                         onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                           e.preventDefault();
                           if (page > 1) setPage(page - 1);
                         }}
                         className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                       />
                     </PaginationItem>

                     {paginationItems.map((item, index) =>
                       typeof item === 'number' ? (
                         <PaginationItem key={`${item}-${index}`}>
                           <PaginationLink
                             href={`?page=${item}`}
                             onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                               e.preventDefault();
                               setPage(item);
                             }}
                             isActive={page === item}
                           >
                             {item}
                           </PaginationLink>
                         </PaginationItem>
                       ) : (
                         <PaginationItem key={`${item}-${index}`}>
                           <PaginationEllipsis />
                         </PaginationItem>
                       )
                     )}

                     <PaginationItem>
                       <PaginationNext
                         href={`?page=${page + 1}`}
                         onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                           e.preventDefault();
                           if (page < totalPages) setPage(page + 1);
                         }}
                         className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                       />
                     </PaginationItem>
                   </PaginationContent>
                 </Pagination>
               </div>
             )}
           </div>
         </section>
        </main>
         <StudioTeaser />
         {/* Footer */}
         <footer className="bg-white-800 text-white py-12 border-t-[6px] border-white">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             {/* Footer content remains unchanged from your original structure */}
             {/* This section will likely be empty or contain minimal content as the actual Footer component is in App.tsx */}
           </div>
         </footer>
       </div>
     </>
   </HelmetProvider>
 );
};