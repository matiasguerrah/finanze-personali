import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { runSeed } from './db/seed';
import './index.css';

// Seed default data before the first render so the category grid is never empty.
void runSeed()
  .catch((err: unknown) => console.error('Seed failed', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
