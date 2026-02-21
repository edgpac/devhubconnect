import { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WorkflowJsonPreviewProps {
  workflow: object | null;
  filename?: string;
}

export default function WorkflowJsonPreview({ workflow, filename = 'workflow' }: WorkflowJsonPreviewProps) {
  const [copied, setCopied] = useState(false);

  if (!workflow) return null;

  const jsonString = JSON.stringify(workflow, null, 2);

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
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{filename}.json</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-gray-300 hover:text-white hover:bg-gray-700" onClick={handleCopy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1 text-green-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button size="sm" className="h-7 bg-teal-600 hover:bg-teal-700 text-white" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Download JSON
          </Button>
        </div>
      </div>
      <pre className="bg-gray-950 text-gray-100 text-xs font-mono p-4 overflow-auto max-h-96 leading-relaxed">
        {jsonString}
      </pre>
    </div>
  );
}
