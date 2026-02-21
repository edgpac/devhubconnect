import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TemplateUpload from '@/components/TemplateUpload';
import { ValidationResult } from '@/services/dhcValidator';
import StudioChatPane from './StudioChatPane';

export default function CustomizeTab() {
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  if (!validation?.valid || !validation.workflow) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <strong>How it works:</strong> Upload your DevHubConnect template (.json), then describe
          what you want to change. Claude will output the complete modified workflow ready to import into n8n.
        </div>
        <TemplateUpload onTemplateValidated={setValidation} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
            ✅ {validation.templateId}
          </span>
          <span className="text-gray-400">loaded and ready to customize</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setValidation(null)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Use a different template
        </Button>
      </div>
      <StudioChatPane mode="customize" workflow={validation.workflow} />
    </div>
  );
}
