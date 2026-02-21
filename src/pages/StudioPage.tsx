import { useNavigate } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import WorkflowStudio from '@/components/WorkflowStudio';
import { useAuth } from '@/components/context/AuthProvider';

export default function StudioPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-4 px-4 text-center">
          <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mb-2">
            <Wand2 className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Sign in to use Workflow Studio</h2>
          <p className="text-gray-500 max-w-md">
            Workflow Studio lets you customize templates, build new n8n workflows, and use purchased prompts — all powered by Claude AI.
          </p>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white mt-2" onClick={() => navigate('/auth')}>
            Sign in with GitHub
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-teal-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Workflow Studio</h1>
          </div>
          <p className="text-gray-500 ml-[52px]">
            Customize templates, build new workflows, and use expert prompts — powered by Claude AI.
          </p>
        </div>

        <WorkflowStudio />
      </div>
    </div>
  );
}
