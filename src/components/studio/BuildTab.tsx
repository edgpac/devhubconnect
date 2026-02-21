import { useState } from 'react';
import StudioChatPane from './StudioChatPane';
import WorkflowJsonPreview from './WorkflowJsonPreview';

export default function BuildTab() {
  const [generatedWorkflow, setGeneratedWorkflow] = useState<object | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
        <strong>How it works:</strong> Describe your automation in plain English — the trigger, the services,
        and what should happen. Claude generates a complete n8n workflow JSON ready to import.
      </div>

      <StudioChatPane
        mode="build"
        onWorkflowGenerated={setGeneratedWorkflow}
        placeholder="e.g. When a new row is added to Google Sheets, send a Slack message and create a Notion page…"
      />

      {generatedWorkflow && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Latest Generated Workflow</h3>
          <WorkflowJsonPreview
            workflow={generatedWorkflow}
            filename={(generatedWorkflow as any)?.name?.replace(/\s+/g, '-').toLowerCase() || 'new-workflow'}
          />
        </div>
      )}
    </div>
  );
}
