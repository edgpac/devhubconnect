import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiCall, API_ENDPOINTS } from '@/config/api';
import WorkflowJsonPreview from './WorkflowJsonPreview';

export type StudioMode = 'customize' | 'build' | 'chat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  workflow?: object | null;
  timestamp: Date;
}

interface StudioChatPaneProps {
  mode: StudioMode;
  workflow?: object;
  promptId?: number;
  onWorkflowGenerated?: (workflow: object) => void;
  placeholder?: string;
  fillHeight?: boolean;
}

export default function StudioChatPane({
  mode,
  workflow,
  promptId,
  onWorkflowGenerated,
  placeholder,
  fillHeight = false,
}: StudioChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: mode === 'customize'
        ? '✅ Template loaded. Describe what you want to change — e.g. "Add a Slack notification when the API call fails" or "Change Google Sheets to Airtable".'
        : mode === 'build'
        ? '👋 Describe the automation you want to build. Be specific about the trigger, the services involved, and what should happen. I\'ll generate a complete importable n8n workflow.'
        : '💬 Your purchased prompt is active. Ask me anything related to this workflow.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getEndpoint = () => {
    if (mode === 'customize') return API_ENDPOINTS.STUDIO_CUSTOMIZE;
    if (mode === 'build') return API_ENDPOINTS.STUDIO_BUILD;
    return API_ENDPOINTS.STUDIO_CHAT;
  };

  const buildBody = () => {
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    if (mode === 'customize') return { workflow, userRequest: input.trim(), history };
    if (mode === 'build') return { description: input.trim(), history };
    return { promptId, userMessage: input.trim(), workflowContext: workflow, history };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await apiCall(getEndpoint(), {
        method: 'POST',
        body: JSON.stringify(buildBody()),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data.explanation || data.response || data.rawResponse || 'No response received.';
      const returnedWorkflow = data.modifiedWorkflow || data.workflow || null;

      if (returnedWorkflow && onWorkflowGenerated) onWorkflowGenerated(returnedWorkflow);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        workflow: returnedWorkflow,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col ${fillHeight ? 'h-full' : 'h-[600px]'} bg-white rounded-xl border border-gray-200 overflow-hidden`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-teal-600' : 'bg-gray-100'
            }`}>
              {msg.role === 'user'
                ? <User className="w-4 h-4 text-white" />
                : <Bot className="w-4 h-4 text-gray-600" />}
            </div>
            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-teal-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.workflow && (
                <div className="w-full">
                  <WorkflowJsonPreview
                    workflow={msg.workflow}
                    filename={(msg.workflow as any)?.name?.replace(/\s+/g, '-').toLowerCase() || 'modified-workflow'}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-gray-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex flex-col gap-1.5">
              <div className="flex gap-1 items-center h-4">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-gray-400">
                {elapsed < 5 ? 'Generating…' : elapsed < 20 ? `Generating… ${elapsed}s` : `Still working… ${elapsed}s — complex requests can take up to 55s`}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 bg-gray-50">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || (mode === 'customize'
              ? 'Describe the change you want…'
              : mode === 'build'
              ? 'Describe your automation…'
              : 'Ask a question…')}
            className="resize-none min-h-[44px] max-h-32 bg-white text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-teal-600 hover:bg-teal-700 text-white h-11 px-4 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-1">⌘+Enter to send</p>
      </div>
    </div>
  );
}
