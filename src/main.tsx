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
import { ErrorBoundary } from './ui/ErrorBoundary';

/** Последний рубеж: сбой вне панелей не оставляет пустую страницу. */
const crashed = (
  <p role="alert" style={{ margin: 0, padding: 24 }}>
    Приложение остановилось из-за ошибки. <a href="">Обновите страницу.</a>
  </p>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={crashed}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
