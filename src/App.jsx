

import { useState, useCallback } from 'react';
import MainMenu from './MainMenu';
import ScopaGame from './ScopaGame';

export default function App() {
  const [showMenu, setShowMenu] = useState(true);
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem('scopa_lang');
    return saved || null;
  });
  const [settings, setSettings] = useState({
    music: true,
    sfx: true,
    voices: true,
    haptics: true,
  });

  const handlePlay = useCallback(() => setShowMenu(false), []);
  const handleLocaleChange = useCallback(l => {
    setLocale(l);
    localStorage.setItem('scopa_lang', l);
  }, []);

  return showMenu ? (
    <MainMenu
      onPlay={handlePlay}
      onLocaleChange={handleLocaleChange}
      settings={settings}
      setSettings={setSettings}
      locale={locale}
    />
  ) : (
    <ScopaGame locale={locale} />
  );
}
