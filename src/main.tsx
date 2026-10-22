import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'katex/dist/katex.min.css';
import './styles/global.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
