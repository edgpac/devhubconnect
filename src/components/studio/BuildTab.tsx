import { useState } from 'react';
import { FileJson } from 'lucide-react';
import StudioChatPane from './StudioChatPane';
import WorkflowJsonPreview from './WorkflowJsonPreview';

interface BuildTabProps {
  workflow?: object | null;
}

export default function BuildTab({ workflow }: BuildTabProps) {
  const [generatedWorkflow, setGeneratedWorkflow] = useState<object | null>(null);

  const templateName = workflow ? (workflow as any)?.name || 'your uploaded template' : null;

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
        {templateName ? (
          <>
            <strong>Building on: </strong>
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium text-xs">
              <FileJson className="w-3 h-3" /> {templateName}
            </span>
            <span className="ml-1">
              — Describe the variation or new automation you want. Claude will use your uploaded template's
              structure and services as the base and generate a complete importable n8n workflow.
            </span>
          </>
        ) : (
          <>
            <strong>How it works:</strong> Describe your automation in plain English — the trigger, the services,
            and what should happen. Claude generates a complete n8n workflow JSON ready to import.
          </>
        )}
      </div>

      <StudioChatPane
        mode="build"
        workflow={workflow ?? undefined}
        onWorkflowGenerated={setGeneratedWorkflow}
        placeholder={
          templateName
            ? `e.g. Add a Slack notification step, or swap Google Sheets for Airtable…`
            : `e.g. When a new row is added to Google Sheets, send a Slack message and create a Notion page…`
        }
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
