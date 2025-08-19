import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTemplateValidation } from '../hooks/useTemplateValidation';
import { ValidationResult } from '../services/dhcValidator';

interface TemplateUploadProps {
 onTemplateValidated?: (validation: ValidationResult) => void;
 onPreviewTemplate?: (template: any) => void;
}

const TemplateUpload: React.FC<TemplateUploadProps> = ({ 
 onTemplateValidated, 
 onPreviewTemplate 
}) => {
 const fileInputRef = useRef<HTMLInputElement>(null);
 const [dragActive, setDragActive] = useState(false);
 
 const { 
   validateTemplate, 
   clearValidation, 
   isValidating, 
   validationError, 
   validatedTemplate 
 } = useTemplateValidation();

 const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
   const file = event.target.files?.[0];
   if (!file) return;

   // Check file type
   if (!file.name.endsWith('.json')) {
     alert('Please upload a .json file');
     return;
   }

   try {
     const validation = await validateTemplate(file);
     onTemplateValidated?.(validation);
   } catch (error) {
     console.error('Template validation failed:', error);
   }
 };

 const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
   event.preventDefault();
   setDragActive(false);
   
   const file = event.dataTransfer.files[0];
   if (file && file.name.endsWith('.json')) {
     const dt = new DataTransfer();
     dt.items.add(file);
     if (fileInputRef.current) {
       fileInputRef.current.files = dt.files;
       const syntheticEvent = {
         target: { files: [file] }
       } as React.ChangeEvent<HTMLInputElement>;
       handleFileChange(syntheticEvent);
     }
   }
 };

 const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
   event.preventDefault();
   setDragActive(true);
 };

 const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
   event.preventDefault();
   setDragActive(false);
 };

 const resetUpload = () => {
   if (fileInputRef.current) {
     fileInputRef.current.value = '';
   }
   clearValidation();
 };

 const handlePreview = () => {
   if (validatedTemplate && onPreviewTemplate) {
     // Create a template object for preview
     const templateForPreview = {
       id: validatedTemplate.templateId,
       name: validatedTemplate.metadata?.name || 'Uploaded Template',
       description: validatedTemplate.metadata?.description || 'Template uploaded from DevHubConnect',
       price: 0, // Already owned
       workflowJson: validatedTemplate.workflowJson,
       purchased: true,
       hasAccess: true,
     };
     onPreviewTemplate(templateForPreview);
   }
 };

 return (
   <div className="w-full max-w-2xl mx-auto">
     <Card>
       <CardContent className="p-6">
         <div 
           className={`
             relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 min-h-[300px] flex flex-col items-center justify-center cursor-pointer
             ${dragActive ? 'border-blue-400 bg-blue-50' : ''}
             ${isValidating ? 'border-yellow-400 bg-yellow-50' : ''}
             ${validationError ? 'border-red-400 bg-red-50' : ''}
             ${validatedTemplate ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
           `}
           onDrop={handleDrop}
           onDragOver={handleDragOver}
           onDragLeave={handleDragLeave}
           onClick={() => fileInputRef.current?.click()}
         >
           <input
             ref={fileInputRef}
             type="file"
             accept=".json"
             onChange={handleFileChange}
             className="hidden"
             id="template-file-input"
           />
           
           {!validatedTemplate && !isValidating && !validationError && (
             <div className="space-y-4">
               <Upload className="h-16 w-16 mx-auto text-gray-400" />
               <div>
                 <h3 className="text-xl font-semibold text-gray-700 mb-2">
                   Upload DevHubConnect Template
                 </h3>
                 <p className="text-gray-500 mb-4">
                   Select your .json template file to get started
                 </p>
                 <Button 
                   variant="outline" 
                   className="mx-auto"
                   onClick={(e) => {
                     e.stopPropagation();
                     fileInputRef.current?.click();
                   }}
                 >
                   <FileText className="h-4 w-4 mr-2" />
                   Browse Files
                 </Button>
               </div>
               <div className="text-xs text-gray-400 space-y-1">
                 <p>✓ Only templates purchased from DevHubConnect.com are supported</p>
                 <p>✓ File must be in .json format</p>
                 <p>✓ Maximum file size: 10MB</p>
               </div>
             </div>
           )}
           
           {isValidating && (
             <div className="space-y-4">
               <Loader2 className="h-16 w-16 mx-auto text-yellow-500 animate-spin" />
               <div>
                 <h3 className="text-xl font-semibold text-yellow-700 mb-2">
                   Validating Template...
                 </h3>
                 <p className="text-yellow-600">Verifying your DevHubConnect purchase</p>
                 <div className="mt-4 space-y-2">
                   <div className="w-full bg-yellow-200 rounded-full h-2">
                     <div className="bg-yellow-500 h-2 rounded-full animate-pulse w-3/4"></div>
                   </div>
                   <p className="text-sm text-yellow-600">This may take a few seconds...</p>
                 </div>
               </div>
             </div>
           )}
           
           {validationError && (
             <div className="space-y-4">
               <AlertCircle className="h-16 w-16 mx-auto text-red-500" />
               <div>
                 <h3 className="text-xl font-semibold text-red-700 mb-2">
                   Validation Failed
                 </h3>
                 <p className="text-red-600 mb-4 max-w-md mx-auto">{validationError}</p>
                 <Button onClick={resetUpload} variant="outline">
                   Try Another File
                 </Button>
               </div>
             </div>
           )}
           
           {validatedTemplate && (
             <div className="space-y-4">
               <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
               <div>
                 <h3 className="text-xl font-semibold text-green-700 mb-2">
                   Template Verified Successfully!
                 </h3>
                 
                 <div className="space-y-2 mb-4">
                   <Badge variant="secondary" className="bg-green-100 text-green-800">
                     Purchase ID: {validatedTemplate.purchaseId}
                   </Badge>
                   <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                     Template: {validatedTemplate.templateId}
                   </Badge>
                 </div>

                 <div className="space-y-3">
                   {onPreviewTemplate && (
                     <Button onClick={handlePreview} className="w-full">
                       Preview Template
                     </Button>
                   )}
                   
                   <div className="flex space-x-2">
                     <Button onClick={resetUpload} variant="outline" className="flex-1">
                       Upload Different Template
                     </Button>
                     <Button 
                       onClick={() => {
                         // Handle import to workspace logic here
                         console.log('Import to workspace:', validatedTemplate);
                       }}
                       className="flex-1"
                     >
                       Import to Workspace
                     </Button>
                   </div>
                 </div>
               </div>
             </div>
           )}
         </div>
       </CardContent>
     </Card>
   </div>
 );
};

export default TemplateUpload;