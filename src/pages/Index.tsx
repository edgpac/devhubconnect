// FIX: Import necessary hooks and components from React and other libraries
import { useState, useEffect }  from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TemplateCard } from '../components/TemplateCard'; // Assuming a TemplateCard component exists
// --- FIX: Import the individual parts of your Pagination component ---
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationLink,
  PaginationNext,
} from '../components/ui/pagination'; 

// FIX: Define a type for the template data for type safety
interface Template {
 id: number;
 name: string;
 description: string;
 price: number;
 imageUrl: string;
 // Add any other fields that come from your API
}

const Index = () => {
 // --- State management for templates, pagination, and loading status ---
 const [templates, setTemplates] = useState<Template[]>([]);
 const [currentPage, setCurrentPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [isLoading, setIsLoading] = useState(true);

 // --- Hooks for managing URL search parameters and navigation ---
 const [searchParams] = useSearchParams();
 const navigate = useNavigate();

 // --- useEffect hook to fetch data when the page loads or currentPage changes ---
 useEffect(() => {
   // Read the 'page' parameter from the URL on initial load
   const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
   setCurrentPage(pageFromUrl);

   const fetchTemplates = async (page: number) => {
     setIsLoading(true);
     try {
       // Fetch data from the backend, passing the current page number
       const response = await fetch(`/api/templates?page=${page}&limit=12`);
       const data = await response.json();

       // Update state with the fetched templates and total pages
       setTemplates(data.templates || []);
       setTotalPages(data.totalPages || 1);
     } catch (error) {
       console.error("Failed to fetch templates:", error);
     } finally {
       setIsLoading(false);
     }
   };

   fetchTemplates(pageFromUrl);
 }, [searchParams]); // Rerun this effect if the URL search parameters change

 // --- Function to handle page changes from the pagination component ---
 const handlePageChange = (newPage: number) => {
   setCurrentPage(newPage);
   // This is the key part: it updates the URL, so the back button works correctly.
   navigate(`/templates?page=${newPage}`);
 };

 // --- Added a loading state for better UX ---
 if (isLoading) {
   return (
     <div className="min-h-screen flex items-center justify-center bg-background">
       <p className="text-xl">Loading templates...</p>
     </div>
   );
 }

 // --- Updated the render method to display the template grid and pagination ---
 return (
   <div className="container mx-auto px-4 py-8">
     <h1 className="text-4xl font-bold mb-8">Available Templates</h1>
     
     {templates.length > 0 ? (
       <>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {templates.map((template) => (
             <TemplateCard key={template.id} template={template} />
           ))}
         </div>

         <div className="mt-12 flex justify-center">
           {/* --- FIX: Removed props from Pagination component --- */}
           <Pagination>
             <PaginationContent>
               <PaginationItem>
                 <PaginationPrevious
                   onClick={() => {
                     if (currentPage > 1) {
                       handlePageChange(currentPage - 1);
                     }
                   }}
                   disabled={currentPage === 1}
                 />
               </PaginationItem>

               {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                 <PaginationItem key={page}>
                   <PaginationLink
                     onClick={() => {
                       handlePageChange(page);
                     }}
                     isActive={currentPage === page}
                   >
                     {page}
                   </PaginationLink>
                 </PaginationItem>
               ))}

               <PaginationItem>
                 <PaginationNext
                   onClick={() => {
                     if (currentPage < totalPages) {
                       handlePageChange(currentPage + 1);
                     }
                   }}
                   disabled={currentPage === totalPages}
                 />
               </PaginationItem>
             </PaginationContent>
           </Pagination>
         </div>
       </>
     ) : (
       <p>No templates found.</p>
     )}
   </div>
 );
};

export default Index;