import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, Save, Trash2, Eye } from 'lucide-react';

async function fetchTemplateForEdit(id: string | undefined) {
  if (!id) throw new Error("No template ID provided");
  
  // ✅ FIXED: Use session cookies instead of JWT tokens
  const response = await fetch(`/api/templates/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error("Failed to fetch template.");
  const data = await response.json();
  return data.template;
}

// ✅ FIXED: Updated interface to match server expectations
async function updateTemplate(data: { 
  id: string | undefined; 
  name: string; 
  description: string; 
  price: number; 
  image_url?: string; 
  workflow_json: any 
}) {
  if (!data.id) throw new Error("No ID provided for update");
  
  console.log('🔧 Sending update data:', data);
  
  // ✅ FIXED: Use session cookies instead of JWT tokens
  const response = await fetch(`/api/templates/${data.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Server error response:', errorText);
    throw new Error(`Failed to update template: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function deleteTemplate(id: string | undefined) {
  if (!id) throw new Error("No ID provided for deletion");
  
  // ✅ FIXED: Use session cookies instead of JWT tokens
  const response = await fetch(`/api/templates/${id}`, { 
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Failed to delete template." }));
    throw new Error(errorData.message || "Failed to delete template.");
  }
  return response.json();
}

export const TemplateEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: template, isLoading, error } = useQuery({
    queryKey: ['template', id],
    queryFn: () => fetchTemplateForEdit(id),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [workflowJson, setWorkflowJson] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (template) {
      console.log('Template data received:', template);
      console.log('workflowJson field:', template.workflowJson);
      console.log('workflow_json field:', template.workflow_json);
      
      setName(template.name);
      setDescription(template.description);
      setPrice((template.price / 100).toFixed(2));
      setWorkflowJson(JSON.stringify(template.workflowJson || template.workflow_json || {}, null, 2));
      setImageUrl(template.imageUrl || template.image_url || '');
    }
  }, [template]);

  const updateMutation = useMutation({
    mutationFn: updateTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template', id] });
      navigate(`/template/${id}`);
    },
    onError: (error: Error) => {
      console.error('❌ Update mutation error:', error);
      alert(`Update failed: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      alert("Template deleted successfully!");
      navigate('/');
    },
    onError: (error: Error) => {
      console.error('Delete error:', error);
      alert(`Deletion failed: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // ✅ FIXED: Use server field names and proper price conversion
      const updateData = {
        id,
        name,
        description,
        image_url: imageUrl, // ✅ Use server field name
        price: Math.round(parseFloat(price) * 100), // ✅ Convert to cents
        workflow_json: JSON.parse(workflowJson), // ✅ Use server field name
      };
      
      console.log('🚀 Submitting update:', updateData);
      updateMutation.mutate(updateData);
    } catch (error) {
      console.error('❌ JSON parse error:', error);
      alert("Invalid JSON format in workflow.");
    }
  };

  const handleSaveAndView = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // ✅ FIXED: Use server field names and proper price conversion
      const updateData = {
        id,
        name,
        description,
        image_url: imageUrl, // ✅ Use server field name
        price: Math.round(parseFloat(price) * 100), // ✅ Convert to cents
        workflow_json: JSON.parse(workflowJson), // ✅ Use server field name
      };
      
      console.log('🚀 Save and view:', updateData);
      await updateMutation.mutateAsync(updateData);
      navigate(`/template/${id}`); // ✅ FIXED: Correct route path
    } catch (error) {
      console.error('❌ Save and view error:', error);
      alert("Invalid JSON format in workflow or update failed.");
    }
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this template? This cannot be undone.")) {
      console.log('Attempting to delete template with ID:', id);
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div>Loading editor...</div>;
  if (error) return <div>Error loading template data.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate(`/template/${id}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Template
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={deleteMutation.isPending}
            type="button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Template'}
          </Button>
        </div>
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Edit Template</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
              </div>
              <div>
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="price">Price (USD)</Label>
                <Input id="price" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="workflowJson">Workflow JSON</Label>
                <Textarea id="workflowJson" value={workflowJson} onChange={e => setWorkflowJson(e.target.value)} rows={20} className="font-mono text-xs" />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button 
                  type="button" 
                  onClick={handleSaveAndView} 
                  disabled={updateMutation.isPending} 
                  variant="secondary" 
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Save & View Template
                </Button>
              </div>
              {updateMutation.isError && <p className="text-red-500 text-center">Error: {updateMutation.error.message}</p>}
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};