import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { defaultSegmenter } from './domains/dictionary';
import { loadCedict } from './domains/dictionary/cedict';
import './index.css';

registerSW({ immediate: true });
void loadCedict(defaultSegmenter, `${import.meta.env.BASE_URL}cedict.json`);
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
