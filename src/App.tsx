import { useEffect } from 'react';
import { useAppStore } from './stores/appStore';
import { getOrCreateSession, getSessionId } from './lib/supabase';
import { MainLayout } from './components/Layout';
import { EditorView } from './features/Editor';
import { TemplatesView } from './features/Templates';
import { TechniquesView } from './features/Techniques';
import { ChainsView } from './features/Chains';
import { MarketplaceView } from './features/Marketplace';
import { HistoryView } from './features/History';
import { TestingView } from './features/Testing';
import { SettingsView } from './features/Settings';

function App() {
  const { activeView, setSessionToken, setSessionId } = useAppStore();

  useEffect(() => {
    initSession();
  }, []);

  const initSession = async () => {
    try {
      const token = await getOrCreateSession();
      setSessionToken(token);
      const id = await getSessionId(token);
      if (id) {
        setSessionId(id);
      }
    } catch (err) {
    }
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'editor':
        return <EditorView />;
      case 'templates':
        return <TemplatesView />;
      case 'techniques':
        return <TechniquesView />;
      case 'chains':
        return <ChainsView />;
      case 'marketplace':
        return <MarketplaceView />;
      case 'history':
        return <HistoryView />;
      case 'testing':
        return <TestingView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <EditorView />;
    }
  };

  return (
    <MainLayout>
      {renderActiveView()}
    </MainLayout>
  );
}

export default App;
