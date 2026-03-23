import React, { useState, useEffect } from 'react';
import en from './locales/en';
import de from './locales/de';
import fr from './locales/fr';
import it from './locales/it';
import kk from './locales/kk';
import ru from './locales/ru';
import uk from './locales/uk';

const LOCALES = { en, de, fr, it, kk, ru, uk };
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

function detectLocale() {
  const saved = localStorage.getItem('scopa_lang');
  if (saved && LOCALES[saved]) return saved;
  const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('uk')) return 'uk';
  if (lang.startsWith('kk')) return 'kk';
  if (lang.startsWith('ru')) return 'ru';
  if (lang.startsWith('it')) return 'it';
  return 'en';
}

export default function MainMenu({ onPlay, onLocaleChange, settings, setSettings }) {
  const [locale, setLocale] = useState(detectLocale());
  const t = LOCALES[locale] || LOCALES.en;

  useEffect(() => {
    localStorage.setItem('scopa_lang', locale);
    if (onLocaleChange) onLocaleChange(locale);
  }, [locale, onLocaleChange]);

  function handleLangChange(e) {
    setLocale(e.target.value);
  }

  function toggleSetting(key) {
    setSettings(s => ({ ...s, [key]: !s[key] }));
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', width: '100%', background: '#181818', color: '#f0c040', fontFamily: 'Palatino Linotype, Georgia, serif',
    }}>
      <h1 style={{ fontSize: 48, marginBottom: 8, letterSpacing: 2 }}>Scopa!</h1>
      <div style={{ fontSize: 18, marginBottom: 32, color: '#ffeeb0', textAlign: 'center', maxWidth: 420 }}>
        Meet the Scopa game from Nancy Drew: The Phantom of Venice!
      </div>
      <button
        onClick={onPlay}
        style={{
          fontSize: 22, padding: '12px 48px', borderRadius: 16, border: 'none', background: 'linear-gradient(90deg,#f0c040,#b89820)', color: '#181818', fontWeight: 700, marginBottom: 32, cursor: 'pointer', boxShadow: '0 2px 8px #0008',
        }}
      >
        Play
      </button>
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <label style={{ fontSize: 16 }}>
          <span style={{ marginRight: 8 }}>🌐</span>
          <select value={locale} onChange={handleLangChange} style={{ fontSize: 16, borderRadius: 8, padding: '4px 12px' }}>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
        <SettingToggle label="Music" value={settings.music} onClick={() => toggleSetting('music')} icon="🎵" />
        <SettingToggle label="SFX" value={settings.sfx} onClick={() => toggleSetting('sfx')} icon="🔊" />
        <SettingToggle label="Voices" value={settings.voices} onClick={() => toggleSetting('voices')} icon="🗣️" />
        {('ontouchstart' in window || navigator.maxTouchPoints > 0) && (
          <SettingToggle label="Haptics" value={settings.haptics} onClick={() => toggleSetting('haptics')} icon="📳" />
        )}
      </div>
      <div style={{ fontSize: 10, color: '#ffeeb0', maxWidth: 600, textAlign: 'center', marginTop: 32, lineHeight: 1.5 }}>
        Copyright © 2011-2026 Mike Lucyšyn and Nancy Drew Global. HER INTERACTIVE, DARE TO PLAY, DOSSIER, CODES & CLUES, and HI KIDS are trademarks of HeR Interactive, Inc. NANCY DREW is a registered trademark of Simon & Schuster, Inc. and is used under license. Copyright in the NANCY DREW books and charatcers are owned by Simon & Schuster, Inc. All rights reserved. Other brand or product names are trademarks or registered trademarks of their respective holders.
      </div>
    </div>
  );
}

function SettingToggle({ label, value, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 16, padding: '8px 18px', borderRadius: 10, border: '1px solid #b89820', background: value ? '#f0c040' : '#333', color: value ? '#181818' : '#ffeeb0', cursor: 'pointer', minWidth: 80, display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span>{icon}</span> {label}
    </button>
  );
}
