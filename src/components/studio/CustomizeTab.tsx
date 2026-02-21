import { useState } from 'react';
import { ArrowLeft, Download, Copy, Check, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TemplateUpload from '@/components/TemplateUpload';
import { ValidationResult } from '@/services/dhcValidator';
import StudioChatPane from './StudioChatPane';

function JsonPanel({ workflow, filename }: { workflow: object; filename: string }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(workflow, null, 2);
  const lines = jsonString.split('\n');

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-gray-200 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileJson className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-xs text-gray-300 font-mono truncate max-w-[160px]">{filename}.json</span>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-3 h-3 mr-1 text-green-400" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleDownload}
          >
            <Download className="w-3 h-3 mr-1" />
            Download
          </Button>
        </div>
      </div>

      {/* Line numbers + code */}
      <div className="flex flex-1 overflow-hidden bg-gray-950">
        <div className="select-none text-right px-3 py-4 text-gray-600 text-xs font-mono leading-5 border-r border-gray-800 flex-shrink-0">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 overflow-auto text-gray-100 text-xs font-mono p-4 leading-5 whitespace-pre">
          {jsonString}
        </pre>
      </div>
    </div>
  );
}

export default function CustomizeTab() {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<object | null>(null);

  if (!validation?.valid || !validation.workflow) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <strong>How it works:</strong> Upload your DevHubConnect template (.json), then describe
          what you want to change. Claude will output the complete modified workflow ready to import into n8n.
        </div>
        <TemplateUpload
          onTemplateValidated={(v) => {
            setValidation(v);
            setActiveWorkflow(v?.workflow ?? null);
          }}
        />
      </div>
    );
  }

  const displayWorkflow = activeWorkflow || validation.workflow;
  const filename = (validation.templateId || 'workflow').replace(/\s+/g, '-').toLowerCase();
  const isModified = activeWorkflow && activeWorkflow !== validation.workflow;

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
            ✅ {validation.templateId}
          </span>
          <span className="text-gray-400">loaded and ready to customize</span>
          {isModified && (
            <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs font-medium">
              ● Modified
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setValidation(null); setActiveWorkflow(null); }}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Use a different template
        </Button>
      </div>

      {/* Split pane — VS Code style */}
      <div className="flex gap-3 h-[680px]">
        {/* Left: JSON viewer */}
        <div className="w-[42%] flex-shrink-0">
          <JsonPanel workflow={displayWorkflow} filename={filename} />
        </div>

        {/* Right: Claude chat */}
        <div className="flex-1 min-w-0">
          <StudioChatPane
            mode="customize"
            workflow={validation.workflow}
            fillHeight
            onWorkflowGenerated={(w) => setActiveWorkflow(w)}
          />
        </div>
      </div>
    </div>
  );
}
