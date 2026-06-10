// Archivo: src/main.jsx
// Propósito: montar la aplicación React y cargar los estilos adaptados.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/snoopy-project-2.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
