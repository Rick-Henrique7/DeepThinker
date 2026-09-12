import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { GraphPage } from './pages/GraphPage';
import { AdvogadoPage } from './pages/AdvogadoPage';

function Shell() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-20 sm:pb-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/grafo" element={<GraphPage />} />
          <Route path="/advogado" element={<AdvogadoPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

export default App;
