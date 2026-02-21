import { useNavigate } from 'react-router-dom';
import { Wand2, Settings2, Sparkles, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/context/AuthProvider';

export default function StudioTeaser() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  return (
    <section className="py-16 bg-gradient-to-br from-teal-50 to-emerald-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Sparkles className="w-4 h-4" />
          Powered by Claude AI
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Workflow Studio
        </h2>
        <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
          The AI workspace for n8n automation. Customize templates, build new workflows from scratch,
          and use expert prompts — all in one place.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 text-left">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mb-3">
              <Settings2 className="w-5 h-5 text-teal-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Customize Templates</h3>
            <p className="text-sm text-gray-500">
              Upload any DevHubConnect template and describe your changes. Claude modifies the workflow JSON instantly — ready to import.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
              <Wand2 className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Build From Scratch</h3>
            <p className="text-sm text-gray-500">
              Describe your automation in plain English. Get a complete, importable n8n workflow JSON in seconds.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Prompt Store</h3>
            <p className="text-sm text-gray-500">
              Buy expert-engineered prompts that unlock specialized AI workflows inside the Studio.
            </p>
          </div>
        </div>

        <Button
          size="lg"
          className="bg-teal-600 hover:bg-teal-700 text-white px-8"
          onClick={() => navigate(currentUser ? '/studio' : '/auth')}
        >
          <Wand2 className="w-5 h-5 mr-2" />
          {currentUser ? 'Open Studio' : 'Sign in to Open Studio'}
        </Button>
      </div>
    </section>
  );
}
