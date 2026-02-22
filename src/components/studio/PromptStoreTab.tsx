import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Wand2, CheckCircle, Lock, FileJson, Download, AlertCircle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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

/** Generate a user-facing starter prompt the buyer can paste into Claude.ai or n8n AI */
function buildStarterPrompt(prompt: PromptProduct): string {
  const meta = prompt.workflow_json;
  const nodes = meta?.compatibleNodes?.join(', ') || 'relevant services';
  const useCase = meta?.useCase || 'automation workflow';
  return `You are an expert n8n workflow engineer.

I need to build an n8n automation for: ${useCase}

The workflow should use these services/nodes: ${nodes}

Please generate a complete, importable n8n workflow JSON. Requirements:
- Output only valid JSON inside a \`\`\`json code block
- Include all required node types, connections, and parameters
- Use placeholder credentials (id: "1") for all credential references
- Follow the n8n workflow schema: { name, nodes, connections, settings, meta }
- After the JSON, provide a short explanation of how the workflow operates

Begin the workflow now.`;
}

export default function PromptStoreTab({ initialPromptId }: { initialPromptId?: number }) {
  const [activePromptId, setActivePromptId] = useState<number | null>(initialPromptId || null);
  const [isPurchasing, setIsPurchasing] = useState<number | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
    setPurchaseError(null);
    setIsPurchasing(promptId);
    try {
      const res = await apiCall(API_ENDPOINTS.CREATE_CHECKOUT, {
        method: 'POST',
        body: JSON.stringify({ templateId: promptId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyOwned) {
          setPurchaseError('You already own this combo — click "Use in Studio" to activate it.');
        } else if (data.redirectToLogin) {
          navigate('/auth');
        } else {
          setPurchaseError(data.message || data.error || 'Checkout failed. Please try again.');
        }
        return;
      }
      if (!data.url) {
        setPurchaseError('No checkout URL returned. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setPurchaseError('Network error — please check your connection and try again.');
      console.error('Purchase error:', err);
    } finally {
      setIsPurchasing(null);
    }
  };

  const handleDownloadStarterPrompt = (prompt: PromptProduct) => {
    const text = buildStarterPrompt(prompt);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prompt.name.replace(/\s+/g, '-').toLowerCase()}-starter-prompt.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activePrompt = prompts.find(p => p.id === activePromptId);

  const q = search.trim().toLowerCase();
  const filteredPrompts = q
    ? prompts.filter(p => {
        const meta = p.workflow_json;
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (meta?.useCase?.toLowerCase().includes(q) ?? false) ||
          (meta?.compatibleNodes?.some(n => n.toLowerCase().includes(q)) ?? false)
        );
      })
    : prompts;

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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-teal-600 hover:text-teal-700"
              onClick={() => handleDownloadStarterPrompt(activePrompt)}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download Starter Prompt
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setActivePromptId(null)}>
              ← Browse
            </Button>
          </div>
        </div>

        {/* Starter prompt info */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800 flex items-start gap-2">
          <Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-teal-600" />
          <span>
            <strong>Starter Prompt included:</strong> Download a ready-to-paste prompt you can use directly
            in <strong>Claude.ai</strong> or <strong>n8n's AI assistant</strong> to generate a working workflow
            without the Studio. This complements the expert system instruction active below.
          </span>
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
          <span className="text-gray-500">The actual prompt is never displayed.</span>{' '}
          You also receive a <span className="text-white font-medium">Starter Prompt</span> you can paste
          directly into Claude.ai or n8n to generate working workflows outside the Studio.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
            <FileJson className="w-3.5 h-3.5" /> Importable n8n JSON included
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
            <Wand2 className="w-3.5 h-3.5" /> Expert prompt activates in Studio
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
            <Download className="w-3.5 h-3.5" /> Starter Prompt for Claude.ai / n8n
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" /> System prompt text stays private
          </span>
        </div>
      </div>

      {/* Purchase error */}
      {purchaseError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{purchaseError}</span>
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setPurchaseError(null)}>✕</button>
        </div>
      )}

      {/* Search bar */}
      {!isLoading && prompts.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, use case, or service (e.g. Slack, email triage…)"
            className="pl-9 pr-9 bg-white"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch('')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

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

      {!isLoading && prompts.length > 0 && filteredPrompts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Search className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No prompts match "{search}"</p>
          <p className="text-sm mt-1">Try a different keyword — service name, use case, or automation type.</p>
          <Button variant="ghost" size="sm" className="mt-3 text-teal-600" onClick={() => setSearch('')}>
            Clear search
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPrompts.map(prompt => {
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
