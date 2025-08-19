import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, FileText, Download, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ValidationResult } from '../services/dhcValidator';

interface ChatInterfaceProps {
  validatedTemplate: ValidationResult;
  onClose: () => void;
  onBack?: () => void;
  onGoHome?: () => void;
  onGoToDashboard?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  validatedTemplate,
  onClose,
  onBack,
  onGoHome,
  onGoToDashboard
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `✅ **Template loaded successfully!**\n\n📄 **Template:** ${validatedTemplate.templateId}\n🔑 **Purchase ID:** ${validatedTemplate.purchaseId}\n\n🤖 I'm ready to help you set up this n8n workflow. Ask me anything about:\n\n• **Credentials setup** - "How do I add API keys?"\n• **Testing workflows** - "How do I test this?"\n• **Troubleshooting** - "My workflow isn't working"\n• **Specific nodes** - "How do I configure the Slack node?"\n\nWhat would you like to know?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage.content,
          templateContext: {
            templateId: validatedTemplate.templateId,
            purchaseId: validatedTemplate.purchaseId,
            hasValidTemplate: true
          }
        })
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Please try again or check your connection.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Bot className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                DevHubConnect Setup Assistant
              </h1>
              <p className="text-sm text-gray-600">{validatedTemplate.templateId}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            ✓ Verified Template
          </Badge>
          {onGoToDashboard && (
            <Button variant="outline" size="sm" onClick={onGoToDashboard}>
              Dashboard
            </Button>
          )}
          {onGoHome && (
            <Button variant="outline" size="sm" onClick={onGoHome}>
              Home
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Template Info Bar */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-blue-800 font-medium">Template:</span>
              <span className="text-blue-700">{validatedTemplate.templateId}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-800 font-medium">Purchase ID:</span>
              <span className="text-blue-700">{validatedTemplate.purchaseId}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-blue-700 border-blue-300">
            <Download className="h-4 w-4 mr-2" />
            Download JSON
          </Button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.map((message) => (
          <div key={message.id} className="flex gap-4">
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              message.role === 'assistant' 
                ? 'bg-blue-100' 
                : 'bg-gray-100'
            }`}>
              {message.role === 'assistant' ? (
                <Bot className="h-5 w-5 text-blue-600" />
              ) : (
                <User className="h-5 w-5 text-gray-600" />
              )}
            </div>

            {/* Message Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {message.role === 'assistant' ? 'DevHubConnect Assistant' : 'You'}
                </span>
                <span className="text-xs text-gray-500">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              
              <div className={`prose prose-sm max-w-none ${
                message.role === 'assistant' 
                  ? 'text-gray-800' 
                  : 'text-gray-700 bg-gray-50 rounded-lg px-4 py-3'
              }`}>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {message.content}
                </pre>
              </div>

              {/* Copy button for assistant messages */}
              {message.role === 'assistant' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                  onClick={() => copyToClipboard(message.content)}
                >
                  Copy response
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Bot className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-900">
                  DevHubConnect Assistant
                </span>
                <span className="text-xs text-gray-500">thinking...</span>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about setting up your n8n workflow..."
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={Math.min(Math.max(input.split('\n').length, 1), 4)}
              disabled={loading}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || loading}
            className="px-4 py-3"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="mt-2 text-xs text-gray-500 text-center">
          Press Enter to send, Shift + Enter for new line
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
