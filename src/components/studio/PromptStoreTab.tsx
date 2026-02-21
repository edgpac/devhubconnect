import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Wand2, CheckCircle, Lock, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_ENDPOINTS, apiCall } from '@/config/api';
import { loadStripe } from '@stripe/stripe-js';
import StudioChatPane from './StudioChatPane';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface PromptProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  purchased?: boolean;
  workflow_json?: {
    type?: string;
    content?: string;
    useCase?: string;
    compatibleNodes?: string[];
  };
}

export default function PromptStoreTab({ initialPromptId }: { initialPromptId?: number }) {
  const [activePromptId, setActivePromptId] = useState<number | null>(initialPromptId || null);
  const [isPurchasing, setIsPurchasing] = useState<number | null>(null);
  const navigate = useNavigate();

  const { data: prompts = [], isLoading } = useQuery<PromptProduct[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await apiCall(`${API_ENDPOINTS.TEMPLATES}?category=prompt`);
      if (!res.ok) throw new Error('Failed to load prompts');
      const data = await res.json();
      return Array.isArray(data) ? data : data.templates || [];
    },
  });

  const handlePurchase = async (promptId: number) => {
    setIsPurchasing(promptId);
    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Payment system unavailable');
      const res = await apiCall(API_ENDPOINTS.CREATE_CHECKOUT, {
        method: 'POST',
        body: JSON.stringify({ templateId: promptId }),
      });
      if (!res.ok) throw new Error('Failed to create checkout session');
      const session = await res.json();
      window.location.href = session.url;
    } catch (err) {
      console.error('Purchase error:', err);
    } finally {
      setIsPurchasing(null);
    }
  };

  const activePrompt = prompts.find(p => p.id === activePromptId);

  if (activePromptId && activePrompt) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">
              <Wand2 className="w-3.5 h-3.5" /> {activePrompt.name}
            </span>
            <span className="text-gray-400">is active</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActivePromptId(null)}>
            ← Browse prompts
          </Button>
        </div>
        <StudioChatPane mode="chat" promptId={activePromptId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Transparency banner */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm text-gray-200 space-y-2">
        <p className="font-semibold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-teal-400" /> How Prompt + JSON combos work
        </p>
        <p className="text-gray-400 leading-relaxed">
          Each product is a <span className="text-white font-medium">JSON template + expert prompt combo</span>.
          The prompt runs <span className="text-teal-400 font-medium">invisibly</span> as Claude's system
          instruction — you interact with the AI result, not the prompt text itself.{' '}
          <span className="text-gray-500">The actual prompt is never displayed.</span>
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
            <FileJson className="w-3.5 h-3.5" /> Importable n8n JSON included
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
            <Wand2 className="w-3.5 h-3.5" /> Expert prompt activates in Studio
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" /> Prompt text stays private
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && prompts.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Wand2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Prompts coming soon</p>
          <p className="text-sm mt-1">Expert n8n prompt packs are being added — check back shortly.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {prompts.map(prompt => {
          const meta = prompt.workflow_json;
          const isPurchased = prompt.purchased;
          return (
            <div key={prompt.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{prompt.name}</h3>
                  <span className="inline-flex items-center gap-1 text-xs text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full font-medium">
                    <FileJson className="w-3 h-3" /> JSON + Prompt combo
                  </span>
                </div>
                {isPurchased && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Owned
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">{prompt.description}</p>

              <p className="text-xs text-gray-400 italic flex items-center gap-1">
                <Lock className="w-3 h-3" /> Prompt text is never displayed — it runs invisibly in the Studio.
              </p>

              {meta?.useCase && (
                <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5">
                  <strong>Use case:</strong> {meta.useCase}
                </p>
              )}

              {meta?.compatibleNodes && meta.compatibleNodes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {meta.compatibleNodes.map(node => (
                    <Badge key={node} variant="secondary" className="text-xs px-2 py-0.5">
                      {node}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
                <span className="text-sm font-bold text-gray-900">
                  ${(prompt.price / 100).toFixed(2)}
                </span>
                {isPurchased ? (
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setActivePromptId(prompt.id)}>
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Use in Studio
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPurchasing === prompt.id}
                    onClick={() => handlePurchase(prompt.id)}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                    {isPurchasing === prompt.id ? 'Redirecting…' : 'Get Combo'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
