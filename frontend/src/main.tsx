import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Fontes do site, servidas pelo próprio app (sem depender do Google Fonts)
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './index.css';
import { applyTheme } from './lib/theme';

// Aplica o tema salvo antes do primeiro desenho, para a tela não piscar com o tema errado
applyTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
