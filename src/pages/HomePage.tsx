import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
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
 Users,
 Star,
 ChevronsUpDown,
} from 'lucide-react';
import ChatBox from '../components/ChatBox';
import { API_ENDPOINTS, apiCall } from '../config/api';

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

 const location = useLocation();
 const navigate = useNavigate();

 const initialPage = useMemo(() => {
   const params = new URLSearchParams(location.search);
   const page = parseInt(params.get('page') || '1', 10);
   return Math.max(1, page);
 }, [location.search]);

 const [searchTerm, setSearchTerm] = useState('');
 const [selectedCategory, setSelectedCategory] = useState('all');
 const [sortOrder, setSortOrder] = useState('all');
 const [currentPage, setCurrentPage] = useState(initialPage);

 const templatesPerPage = 9;

 // ✅ FIX: Save current page to sessionStorage whenever it changes
 useEffect(() => {
   sessionStorage.setItem('lastTemplatePage', currentPage.toString());
 }, [currentPage]);

 useEffect(() => {
   const params = new URLSearchParams(location.search);
   if (currentPage !== 1) {
     params.set('page', currentPage.toString());
   } else {
     params.delete('page');
   }
   navigate(`?${params.toString()}`, { replace: true });
 }, [currentPage, location.search, navigate]);

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
 let filtered: Template[] = Array.isArray(templates) ? templates : [];

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
   if (currentPage > totalPages && totalPages > 0) {
     setCurrentPage(totalPages);
   }
   else if (totalPages === 0 && currentPage !== 1) {
     setCurrentPage(1);
   }
 }, [currentPage, totalPages]);

 const startIndex = (currentPage - 1) * templatesPerPage;
 const endIndex = startIndex + templatesPerPage;
 const currentTemplates = processedTemplates.slice(startIndex, endIndex);
 const paginationItems = getPaginationItems(currentPage, totalPages);

 const handleFilterChange = (category: string) => {
   if (category === 'popular') {
     setSortOrder('popular');
   } else if (sortOrder === 'popular') {
     setSortOrder('newest');
   }
   setSelectedCategory(category);
   setCurrentPage(1);
 };

 const handleSortChange = (value: string) => {
   setSortOrder(value);
   setCurrentPage(1);
 };

 const handleSearchChange = (value: string) => {
   setSearchTerm(value);
   setCurrentPage(1);
   if (value.trim()) {
     trackSearch(value.trim());
   }
 };

 const handleTemplateClick = (templateId: number) => {
   trackTemplateView(templateId);
   navigate(`/template/${templateId}`);
 };

 if (isLoading) {
   return <div className="text-center p-10">Loading Marketplace...</div>;
 }

 if (error) {
   return (
     <div className="text-center p-10 text-red-500">
       Error: Failed to load templates. Is the backend server running?
     </div>
   );
 }

 return (
   <HelmetProvider>
     <>
       <Helmet>
         <title>Automation Templates | DevHubConnect</title>
       </Helmet>

       <div className="min-h-screen bg-gray-50">
         <Navbar />

         {/* Hero Section */}
         <section className="bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-800 text-white py-20">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
             <h1 className="text-5xl font-bold mb-6">The Automation Platform</h1>
             <p className="text-xl mb-8 text-teal-100 max-w-3xl mx-auto">
               We won't just hand you a solution, we'll build it for you.<br />
               Upload your template and get step by step assistance from our AI.<br />
               Save hours of development time with instantly deployable n8n solutions.
            </p>
             <div className="flex justify-center space-x-8 text-center">
               <div className="flex flex-col items-center">
                 <TrendingUp className="w-8 h-8 mb-2" />
                 <span className="text-2xl font-bold">{templates.length}+</span>
                 <span className="text-teal-100">Templates</span>
               </div>
               <div className="flex flex-col items-center">
                 <Users className="w-8 h-8 mb-2" />
                 <span className="text-2xl font-bold">7000+</span>
                 <span className="text-teal-100">Users</span>
               </div>
               <div className="flex flex-col items-center">
                 <Star className="w-8 h-8 mb-2" />
                 <span className="text-2xl font-bold">4.9</span>
                 <span className="text-teal-100">Rating</span>
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
                   <SelectTrigger className="w-[180px]">
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
         <section className="py-12">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             <div className="flex items-center justify-between mb-8">
               <h2 className="text-3xl font-bold text-gray-900">Available Templates</h2>
               <div className="flex items-center text-gray-600">
                 <Zap className="w-5 h-5 mr-2" />
                 <span>{processedTemplates.length} templates found</span>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {currentTemplates.map((template) => (
                 <TemplateCard
                   key={template.id}
                   template={template}
                 />
               ))}
             </div>

             {processedTemplates.length === 0 && (
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
                     setCurrentPage(1);
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
                         href={`?page=${currentPage - 1}`}
                         onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                           e.preventDefault();
                           if (currentPage > 1) setCurrentPage(currentPage - 1);
                         }}
                         className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                       />
                     </PaginationItem>

                     {paginationItems.map((item, index) =>
                       typeof item === 'number' ? (
                         <PaginationItem key={`${item}-${index}`}>
                           <PaginationLink
                             href={`?page=${item}`}
                             onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                               e.preventDefault();
                               setCurrentPage(item);
                             }}
                             isActive={currentPage === item}
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
                         href={`?page=${currentPage + 1}`}
                         onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                           e.preventDefault();
                           if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                         }}
                         className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                       />
                     </PaginationItem>
                   </PaginationContent>
                 </Pagination>
               </div>
             )}
           </div>
         </section>
         {/* ChatBox Section */}
         <section className="py-12 bg-white-50">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
             <h2 className="text-3xl font-bold text-gray-900 mb-6">Need Assistance? Ask Our AI!</h2>
             <p className="text-lg text-gray-600 mb-8">
               Upload your .json file to get AI help deploying your n8n template or answering related questions..
             </p>
             <div className="max-w-7xl mx-auto">
               <ChatBox />
             </div>
           </div>
         </section>
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