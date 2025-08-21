import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Upload, X, Brain, LogIn, BarChart3, LogOut, Trash2, Eye, Home } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/context/AuthProvider';

export function AdminDashboard() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [workflowJson, setWorkflowJson] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ FIXED: Use AuthProvider for authentication
  const { currentUser, logout } = useAuth();
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const navigate = useNavigate();

  // ✅ FIXED: Check if user is admin using AuthProvider
  const isAuthenticated = currentUser && (currentUser.role === 'admin' || currentUser.isAdmin);

  // ✅ FIXED: Use AuthProvider logout
  const handleSignOut = () => {
    logout();
    toast.success('Signed out successfully', { description: 'You have been logged out of the admin dashboard.' });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToImgBB = async () => {
    if (!imageFile) return null;

    const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY;
    if (!apiKey) {
      throw new Error("ImgBB API key is not configured.");
    }

    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      return result.data.url;
    } else {
      throw new Error(result.error?.message || 'Image upload failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setIsError(false);

    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        finalImageUrl = await uploadImageToImgBB() || '';
      }

      const parsedJson = JSON.parse(workflowJson);
      
      // ✅ FIXED: Use session cookies instead of JWT tokens
      const response = await fetch('/api/templates', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          price: parseFloat(price),
          workflowJson: parsedJson,
          imageUrl: finalImageUrl,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Upload successful!', { description: "Template has been added to the marketplace." });
        setMessage('Upload successful!');
        // Clear form
        setName('');
        setDescription('');
        setPrice('');
        setWorkflowJson('');
        setImageUrl('');
        setImageFile(null);
        setImagePreview(null);
      } else {
        if (response.status === 409) {
          throw new Error(data.message || 'Template with this workflow JSON already exists.');
        }
        throw new Error(data.message || 'An unknown error occurred during upload.');
      }
    } catch (err: any) {
      setIsError(true);
      setMessage(`Upload failed: ${err.message}`);
      toast.error('Upload Failed', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadAndGoToTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setIsError(false);

    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        finalImageUrl = await uploadImageToImgBB() || '';
      }

      const parsedJson = JSON.parse(workflowJson);
      
      // ✅ FIXED: Use session cookies instead of JWT tokens
      const response = await fetch('/api/templates', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          price: parseFloat(price),
          workflowJson: parsedJson,
          imageUrl: finalImageUrl,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Upload successful!', { description: "Template has been added to the marketplace." });
        navigate(`/templates/${data.template.id}`);
      } else {
        if (response.status === 409) {
          throw new Error(data.message || 'Template with this workflow JSON already exists.');
        }
        throw new Error(data.message || 'An unknown error occurred during upload.');
      }
    } catch (err: any) {
      setIsError(true);
      setMessage(`Upload failed: ${err.message}`);
      toast.error('Upload Failed', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDetails = async () => {
    setIsGeneratingDetails(true);
    setMessage('');
    setIsError(false);

    if (!workflowJson.trim()) {
      setIsError(true);
      setMessage('Please paste Workflow JSON to generate details.');
      toast.error('Missing JSON', { description: 'Please paste Workflow JSON to generate details.' });
      setIsGeneratingDetails(false);
      return;
    }

    try {
      const parsedJson = JSON.parse(workflowJson);
      
      // ✅ FIXED: Use session cookies instead of JWT tokens
      const response = await fetch('/api/admin/generate-template-details', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ workflowJson: parsedJson }),
      });

      const data = await response.json();

      if (response.ok) {
        setName(data.name);
        setDescription(data.description);
        setPrice((data.price / 100).toFixed(2));
        toast.success('Details Generated!', { description: 'AI has suggested template name, description, and price.' });
        setMessage('Details generated successfully!');
      } else {
        if (response.status === 409) {
          throw new Error(data.message || 'Template with this workflow JSON already exists.');
        }
        throw new Error(data.error || data.message || 'An unknown error occurred during AI generation.');
      }
    } catch (err: any) {
      setIsError(true);
      setMessage(`AI generation failed: ${err.message}`);
      toast.error('AI Generation Failed', { description: err.message });
    } finally {
      setIsGeneratingDetails(false);
    }
  };

  // ✅ FIXED: Handle admin login with session auth
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Admin Login Successful!', { description: 'Welcome to the dashboard.' });
        // Refresh page to trigger AuthProvider re-check
        window.location.reload();
      } else {
        setLoginError(data.message || 'Login failed. Please check your password.');
        toast.error('Login Failed', { description: data.message || 'Invalid password.' });
      }
    } catch (err: any) {
      setLoginError(`Login failed: ${err.message}`);
      toast.error('Login Failed', { description: err.message });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter the admin password to access the dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  disabled={isLoggingIn}
                />
              </div>
              {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>Logging In...</>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Login
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-600">Manage your marketplace and view analytics.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => navigate('/')}
              variant="outline"
              className="flex items-center text-blue-600 border-blue-300 hover:bg-blue-50 hover:border-blue-400"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
            <Button 
              onClick={handleSignOut}
              variant="outline"
              className="flex items-center text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Analytics & Management</CardTitle>
            <CardDescription>View marketplace insights and performance data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate('/admin/analytics')}
              className="w-full bg-green-600 hover:bg-green-700 mb-4"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload New Template</CardTitle>
            <CardDescription>Upload a new workflow template.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              
              <div className="space-y-2">
                <Label>Preview Image</Label>
                <div className="p-4 border-2 border-dashed rounded-lg text-center">
                  {imagePreview ? (
                    <div className="relative group">
                      <img src={imagePreview} alt="Preview" className="max-w-full h-auto rounded-md mx-auto" />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-75"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500 mb-2">Drag & drop or click to upload</p>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        Select Screenshot
                      </Button>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleImageSelect}
                        accept="image/png, image/jpeg, image/gif"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price (USD)</Label>
                <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflowJson">Workflow JSON</Label>
                <Textarea id="workflowJson" value={workflowJson} onChange={(e) => setWorkflowJson(e.target.value)} required rows={10} />
                <Button
                  type="button"
                  onClick={handleGenerateDetails}
                  className="w-full mt-2 bg-blue-600 hover:bg-blue-700"
                  disabled={isGeneratingDetails || isLoading}
                >
                  {isGeneratingDetails ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      AI Generated Details
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={isLoading || isGeneratingDetails}>
                  {isLoading ? 'Uploading...' : 'Upload Workflow'}
                </Button>
                <Button 
                  type="button" 
                  onClick={handleUploadAndGoToTemplate} 
                  disabled={isLoading || isGeneratingDetails} 
                  variant="secondary" 
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Upload & View Template
                </Button>
              </div>
              {message && <p className={`mt-4 text-sm text-center ${isError ? 'text-red-500' : 'text-green-500'}`}>{message}</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}