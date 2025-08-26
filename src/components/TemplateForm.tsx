import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TemplatePreviewModal } from '@/components/TemplatePreviewModal';
import { API_ENDPOINTS, apiCall } from '../config/api';
import { 
  Wand2, 
  Eye, 
  Save, 
  Upload, 
  Loader2,
  FileText,
  DollarSign,
  Tag,
  Image
} from 'lucide-react';
import { toast } from 'sonner';

interface TemplateFormData {
  title: string;
  description: string;
  price: string;
  category: string;
  tags: string[];
  imageUrl: string;
  workflowJson: any;
}

const categories = [
  'automation', 'integration', 'analytics', 'communication', 'productivity',
  'sales', 'marketing', 'customer_support', 'data_processing', 'workflow'
];

export default function TemplateForm() {
  const [formData, setFormData] = useState<TemplateFormData>({
    title: '',
    description: '',
    price: '',
    category: '',
    tags: [],
    imageUrl: '',
    workflowJson: null
  });
  
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentTag, setCurrentTag] = useState('');

  const generateDetails = async () => {
    if (!formData.workflowJson) {
      toast.error('Please upload a workflow JSON first');
      return;
    }

    setLoading(true);
    try {
      // FIXED: Use apiCall instead of raw fetch
      const response = await apiCall('/api/ai/generate-template-details', {
        method: 'POST',
        body: JSON.stringify({
          workflowJson: formData.workflowJson,
          templateName: formData.title,
          description: formData.description
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate AI details');
      }

      const data = await response.json();
      
      // Parse AI response (you might need to adjust this based on your AI response format)
      setFormData(prev => ({
        ...prev,
        title: data.title || data.response?.title || '',
        description: data.description || data.response?.description || '',
        price: data.price ? data.price.toString() : data.response?.price?.toString() || '',
      }));

      toast.success('AI details generated successfully!');
    } catch (error) {
      console.error('Error fetching AI details:', error);
      toast.error('Failed to generate AI details');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a .json file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workflowJson = JSON.parse(e.target?.result as string);
        setFormData(prev => ({ ...prev, workflowJson }));
        toast.success('Workflow uploaded successfully!');
      } catch (error) {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const addTag = () => {
    if (currentTag.trim() && !formData.tags.includes(currentTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, currentTag.trim()]
      }));
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.price || !formData.workflowJson) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const response = await apiCall(API_ENDPOINTS.TEMPLATES, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: formData.title,
          description: formData.description,
          price: parseFloat(formData.price),
          workflowJson: formData.workflowJson,
          imageUrl: formData.imageUrl,
          category: formData.category,
          tags: formData.tags,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      const result = await response.json();
      toast.success('Template created successfully!');
      
      // Reset form or redirect
      setFormData({
        title: '',
        description: '',
        price: '',
        category: '',
        tags: [],
        imageUrl: '',
        workflowJson: null
      });
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const previewTemplate = {
    id: 0,
    name: formData.title || 'Untitled Template',
    description: formData.description || 'No description provided',
    price: parseFloat(formData.price || '0') * 100, // Convert to cents
    imageUrl: formData.imageUrl,
    workflowJson: formData.workflowJson,
    _tags: formData.tags,
    createdAt: new Date().toISOString(),
    purchased: false,
    hasAccess: true, // Preview access
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-6 w-6" />
            <span>Create New Template</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Workflow Upload */}
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <Upload className="h-4 w-4" />
                <span>Workflow JSON File *</span>
              </Label>
              <Input
                type="file"
                accept=".json"
                onChange={handleWorkflowUpload}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
              />
              {formData.workflowJson && (
                <div className="flex items-center space-x-2 text-green-600">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Workflow loaded successfully</span>
                </div>
              )}
            </div>

            {/* AI Generation */}
            {formData.workflowJson && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wand2 className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">AI Assistant</span>
                  </div>
                  <Button
                    type="button"
                    onClick={generateDetails}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-blue-600 mt-2">
                  Let AI analyze your workflow and suggest title, description, and pricing
                </p>
              </div>
            )}

            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="title">Template Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter template title"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4" />
                  <span>Price (USD) *</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this template does and how it helps users..."
                className="min-h-[120px]"
              />
            </div>

            {/* Category and Image */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Tag className="h-4 w-4" />
                  <span>Category</span>
                </Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Image className="h-4 w-4" />
                  <span>Preview Image URL</span>
                </Label>
                <Input
                  value={formData.imageUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/image.png"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex space-x-2">
                <Input
                  value={currentTag}
                  onChange={(e) => setCurrentTag(e.target.value)}
                  placeholder="Enter tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} variant="outline">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map(tag => (
                  <Badge 
                    key={tag} 
                    variant="secondary" 
                    className="cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-6 border-t">
              <Button
                type="button"
                onClick={() => setShowPreview(true)}
                variant="outline"
                disabled={!formData.title || !formData.description}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Template
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onPurchase={() => {
          toast.info('This is a preview - template not yet created');
          setShowPreview(false);
        }}
        onDownload={() => {
          toast.info('This is a preview - template not yet created');
          setShowPreview(false);
        }}
      />
    </div>
  );
}