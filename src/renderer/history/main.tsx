import React from 'react'
import { createRoot } from 'react-dom/client'
import { HistoryApp } from './App'
import '../shared/common.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HistoryApp />
  </React.StrictMode>
)
