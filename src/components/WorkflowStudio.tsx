import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings2, Wand2, ShoppingBag, Lock } from 'lucide-react';
import CustomizeTab from './studio/CustomizeTab';
import BuildTab from './studio/BuildTab';
import PromptStoreTab from './studio/PromptStoreTab';

type StudioTab = 'customize' | 'build' | 'prompt-store';

const TAB_SESSION_KEY = 'studio-active-tab';

export default function WorkflowStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [uploadedWorkflow, setUploadedWorkflow] = useState<object | null>(null);

  const tabParam = searchParams.get('tab') as StudioTab | null;
  const promptId = searchParams.get('promptId');

  const getInitialTab = (): StudioTab => {
    if (tabParam && ['customize', 'build', 'prompt-store'].includes(tabParam)) return tabParam;
    const stored = sessionStorage.getItem(TAB_SESSION_KEY) as StudioTab | null;
    if (stored && ['customize', 'build', 'prompt-store'].includes(stored)) return stored;
    return 'customize';
  };

  const activeTab = getInitialTab();

  const handleTabChange = (value: string) => {
    // Don't allow switching to build if no JSON uploaded
    if (value === 'build' && !uploadedWorkflow) return;
    sessionStorage.setItem(TAB_SESSION_KEY, value);
    setSearchParams(prev => {
      prev.set('tab', value);
      if (value !== 'prompt-store') prev.delete('promptId');
      return prev;
    });
  };

  useEffect(() => {
    if (tabParam) sessionStorage.setItem(TAB_SESSION_KEY, tabParam);
  }, []);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className={`grid mb-6 h-12 ${uploadedWorkflow ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <TabsTrigger value="customize" className="flex items-center gap-2 text-sm">
          <Settings2 className="w-4 h-4" /> Customize
        </TabsTrigger>

        {uploadedWorkflow && (
          <TabsTrigger value="build" className="flex items-center gap-2 text-sm">
            <Wand2 className="w-4 h-4" /> Build on This
          </TabsTrigger>
        )}

        <TabsTrigger value="prompt-store" className="flex items-center gap-2 text-sm">
          <ShoppingBag className="w-4 h-4" /> Prompt Store
        </TabsTrigger>
      </TabsList>

      {/* Hint shown before upload */}
      {!uploadedWorkflow && (
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Upload a DevHubConnect JSON template in <strong>Customize</strong> to unlock the <strong>Build on This</strong> tab.</span>
        </div>
      )}

      <TabsContent value="customize">
        <CustomizeTab onJsonLoaded={setUploadedWorkflow} />
      </TabsContent>

      <TabsContent value="build">
        <BuildTab workflow={uploadedWorkflow} />
      </TabsContent>

      <TabsContent value="prompt-store">
        <PromptStoreTab initialPromptId={promptId ? parseInt(promptId, 10) : undefined} />
      </TabsContent>
    </Tabs>
  );
}
