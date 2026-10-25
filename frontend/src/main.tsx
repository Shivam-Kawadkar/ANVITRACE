import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Ensure clean light theme state
try {
  localStorage.removeItem('anvitrace_theme');
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
} catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
