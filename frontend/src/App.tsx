import { useState } from 'react';
import { ThoughtInput } from './components/ThoughtInput';

export function App() {
  const [loading, setLoading] = useState(false);

  const handleSaveThought = async (title: string, content: string) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ title, content }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Nota criada e conexões atualizadas:', data);
        alert('Pensamento registrado no seu Segundo Cérebro!');
      } else {
        alert('Erro ao salvar no servidor Laravel.');
      }
    } catch (err) {
      console.error('Erro de conexão:', err);
      alert('Não foi possível conectar ao backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
      <header className="mb-8 text-center space-y-2">
        <h1 className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-4xl font-extrabold text-transparent">
          DeepThinker
        </h1>
        <p className="text-sm text-slate-400">Seu Segundo Cérebro com Grafo de Conhecimento e IA</p>
      </header>

      <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />
    </div>
  );
}

export default App;
