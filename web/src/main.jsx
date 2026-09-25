import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/dist/styles.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initBridge } from './max.js';
import './styles.css';

initBridge();

createRoot(document.getElementById('root')).render(
  <MaxUI className="app">
    <App />
  </MaxUI>,
);
