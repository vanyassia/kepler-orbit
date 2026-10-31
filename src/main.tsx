import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Только нужные алфавиты: кириллица и латиница (полные наборы шрифтов утяжеляли стили вчетверо)
import '@fontsource/tektur/cyrillic-500.css';
import '@fontsource/tektur/latin-500.css';
import '@fontsource/tektur/cyrillic-600.css';
import '@fontsource/tektur/latin-600.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-500.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/cyrillic-600.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/global.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
