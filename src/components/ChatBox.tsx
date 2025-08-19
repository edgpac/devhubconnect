import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TemplateUpload from './TemplateUpload';
import ChatInterface from './ChatInterface';
import { ValidationResult } from '../services/dhcValidator';

export default function ChatBox() {
  // State to hold the current input from the user
  const [input, setInput] = useState('');
  // State to store all messages (user and AI) in the chat history
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: '👋 Welcome! Please upload your DevHubConnect template (.json file) to get started with setup instructions.' }
  ]);
  // State to indicate if an AI response is currently being loaded
  const [loading, setLoading] = useState(false);
  // State to store validated template
  const [validatedTemplate, setValidatedTemplate] = useState<ValidationResult | null>(null);
  // State to control the full-screen chat interface
  const [showChatInterface, setShowChatInterface] = useState(false);
  
  // Navigation hook for React Router
  const navigate = useNavigate();

  /**
   * Handles template validation success
   */
  const handleTemplateValidated = async (validation: ValidationResult) => {
    setValidatedTemplate(validation);
    setShowChatInterface(true); // Open the full-screen chat interface
    
    // Add success message to chat
    const successMessage = {
      role: 'assistant' as const,
      text: `✅ Template verified successfully!\n\n📄 Template: ${validation.templateId}\n🔑 Purchase ID: ${validation.purchaseId}\n\n🤖 Now generating detailed setup instructions...`
    };
    setMessages(prev => [...prev, successMessage]);
    setLoading(true);

    try {
      // Generate setup instructions for the validated template
      const response = await fetch('/api/generate-setup-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: validation.workflow,
          templateId: validation.templateId,
          purchaseId: validation.purchaseId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.instructions) {
        const instructionsMessage = {
          role: 'assistant' as const,
          text: `📋 **Setup Instructions for ${validation.templateId}**\n\n${data.instructions}\n\n💬 You can now ask me questions about this template or request specific help with the setup process.`
        };
        setMessages(prev => [...prev, instructionsMessage]);
      } else {
        throw new Error('No instructions received from API');
      }
    } catch (error) {
      const errorMessage = {
        role: 'assistant' as const,
        text: `❌ Error generating setup instructions: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYou can still ask me questions about your template manually.`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sends the user's message to the backend API and handles the AI response.
   */
  const sendMessage = async () => {
    // Prevent sending empty messages
    if (!input.trim()) return;

    // Create a user message object
    const userMessage = { role: 'user' as const, text: input };
    // Add the user message to the chat history
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      // Prepare the conversation history for the backend
      const conversationHistory = updatedMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      // Include template context if available
      const requestBody: any = {
        prompt: userMessage.text,
        history: conversationHistory,
      };

      if (validatedTemplate) {
        requestBody.templateContext = {
          templateId: validatedTemplate.templateId,
          purchaseId: validatedTemplate.purchaseId,
          hasValidTemplate: true
        };
      }

      // Make a POST request to the backend API
      const res = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        let errorDetails = `HTTP error! status: ${res.status}`;
        try {
          const errorJson = await res.json();
          errorDetails += `, details: ${JSON.stringify(errorJson)}`;
        } catch (jsonError) {
          const errorText = await res.text();
          errorDetails += `, raw response: ${errorText}`;
        }
        setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Backend error: ${errorDetails}` }]);
        return;
      }

      const data = await res.json();
      if (data.response) {
        const aiMessage = { role: 'assistant' as const, text: data.response };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ AI response format unexpected.' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Failed to get response: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles the key down event for Enter key
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };
  
  /**
   * Reset chat and template
   */
  const resetChat = () => {
    setValidatedTemplate(null);
    setShowChatInterface(false);
    setMessages([
      { role: 'assistant', text: '👋 Welcome! Please upload your DevHubConnect template (.json file) to get started with setup instructions.' }
    ]);
    setInput('');
  };

  /**
   * Copy setup instructions to clipboard
   */
  const copyInstructions = () => {
    const setupMessage = messages.find(msg => 
      msg.role === 'assistant' && msg.text.includes('Setup Instructions for')
    );
    if (setupMessage) {
      navigator.clipboard.writeText(setupMessage.text);
      alert('Setup instructions copied to clipboard!');
    }
  };

  return (
    <>
      {/* Full-screen chat interface */}
      {showChatInterface && validatedTemplate && (
        <ChatInterface
          validatedTemplate={validatedTemplate}
          onClose={() => {
            setShowChatInterface(false);
            resetChat();
          }}
          onBack={() => {
            setShowChatInterface(false);
            resetChat();
          }}
          onGoHome={() => {
            resetChat();
            navigate('/');
          }}
          onGoToDashboard={() => {
            resetChat();
            navigate('/dashboard');
          }}
        />
      )}

      {/* Original ChatBox interface - hidden when full-screen chat is open */}
      {!showChatInterface && (
        <div className="p-4 border rounded-md w-full shadow-md font-sans bg-white max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">DevHubConnect Setup Assistant</h2>
            {validatedTemplate && (
              <div className="flex gap-2">
                <button
                  onClick={copyInstructions}
                  className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
                >
                  📋 Copy Instructions
                </button>
                <button
                  onClick={resetChat}
                  className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                >
                  🔄 New Template
                </button>
              </div>
            )}
          </div>

          {/* Template Upload Section - Show only if no template is validated */}
          {!validatedTemplate && (
            <div className="mb-6">
              <TemplateUpload onTemplateValidated={handleTemplateValidated} />
            </div>
          )}

          {/* Validated Template Info */}
          {validatedTemplate && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-lg">✅</span>
                <div>
                  <div className="font-medium">Template: {validatedTemplate.templateId}</div>
                  <div className="text-sm opacity-75">Purchase ID: {validatedTemplate.purchaseId}</div>
                </div>
              </div>
            </div>
          )}

          {/* Message display area */}
          <div className="h-96 overflow-y-auto space-y-3 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm p-3 rounded-lg shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white ml-auto max-w-[85%] text-right'
                    : 'bg-white text-gray-800 mr-auto max-w-[90%] text-left border border-gray-200'
                }`}
                style={{ wordBreak: 'break-word' }}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
              </div>
            ))}
            {loading && (
              <div className="text-sm italic text-gray-500 p-3 text-center">
                <span className="inline-block animate-pulse">🤖 AI is thinking...</span>
              </div>
            )}
          </div>

          {/* Input section - Only show if template is validated */}
          {validatedTemplate && (
            <>
              <input
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ask questions about your template setup..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition duration-200 ease-in-out shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !input.trim()}
              >
                Send Message
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}