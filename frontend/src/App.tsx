import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { GraphPage } from './pages/GraphPage';
import { AdvogadoPage } from './pages/AdvogadoPage';

function Shell() {
  return (
    <div className="min-h-screen flex flex-col bg-black text-neutral-100">
      <Header />
      <main className="flex-1 px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:py-8 pb-28 lg:pb-8">
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
