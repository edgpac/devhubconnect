import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings2, Wand2, ShoppingBag } from 'lucide-react';
import CustomizeTab from './studio/CustomizeTab';
import BuildTab from './studio/BuildTab';
import PromptStoreTab from './studio/PromptStoreTab';

type StudioTab = 'customize' | 'build' | 'prompt-store';

const TAB_SESSION_KEY = 'studio-active-tab';

export default function WorkflowStudio() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as StudioTab | null;
  const promptId = searchParams.get('promptId');

  // Resolve initial tab: URL param → sessionStorage → default
  const getInitialTab = (): StudioTab => {
    if (tabParam && ['customize', 'build', 'prompt-store'].includes(tabParam)) return tabParam;
    const stored = sessionStorage.getItem(TAB_SESSION_KEY) as StudioTab | null;
    if (stored && ['customize', 'build', 'prompt-store'].includes(stored)) return stored;
    return 'customize';
  };

  const activeTab = getInitialTab();

  const handleTabChange = (value: string) => {
    sessionStorage.setItem(TAB_SESSION_KEY, value);
    setSearchParams(prev => {
      prev.set('tab', value);
      if (value !== 'prompt-store') prev.delete('promptId');
      return prev;
    });
  };

  // Clear URL params after reading them on mount so they don't persist on refresh
  useEffect(() => {
    if (tabParam) {
      sessionStorage.setItem(TAB_SESSION_KEY, tabParam);
    }
  }, []);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid grid-cols-3 mb-6 h-12">
        <TabsTrigger value="customize" className="flex items-center gap-2 text-sm">
          <Settings2 className="w-4 h-4" /> Customize
        </TabsTrigger>
        <TabsTrigger value="build" className="flex items-center gap-2 text-sm">
          <Wand2 className="w-4 h-4" /> Build New
        </TabsTrigger>
        <TabsTrigger value="prompt-store" className="flex items-center gap-2 text-sm">
          <ShoppingBag className="w-4 h-4" /> Prompt Store
        </TabsTrigger>
      </TabsList>

      <TabsContent value="customize">
        <CustomizeTab />
      </TabsContent>

      <TabsContent value="build">
        <BuildTab />
      </TabsContent>

      <TabsContent value="prompt-store">
        <PromptStoreTab initialPromptId={promptId ? parseInt(promptId, 10) : undefined} />
      </TabsContent>
    </Tabs>
  );
}
