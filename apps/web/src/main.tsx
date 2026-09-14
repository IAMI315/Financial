import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloadingForUpdate) {
      reloadingForUpdate = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    const buildId = import.meta.env.VITE_BUILD_ID || 'current';
    void navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(buildId)}`, {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.error('Service worker registration failed', error);
      });
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
