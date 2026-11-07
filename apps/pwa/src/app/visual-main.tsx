import React from 'react';
import { createRoot } from 'react-dom/client';
import VisualApp from './VisualApp';
import '../styles/home/home.css';

// Separate entry point: Android WebView will load only this non-chat shell.
// It intentionally never mounts the PWA chat component or its WebSocket.
createRoot(document.getElementById('visual-root')!).render(
  <React.StrictMode><VisualApp preview /></React.StrictMode>,
);
