import React, { useRef, useState } from 'react';
import { Loader2, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { login, register, type AuthUser } from '../lib/auth';
import { Logo } from '../components/Logo';
import { WaterLine } from '../components/WaterLine';

interface LoginPageProps {
  /** isNew = true quando a conta acabou de ser criada (o App mostra "Conta criada"). */
  onLoggedIn: (user: AuthUser, isNew: boolean) => void;
}

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida antes de mandar para o servidor e devolve uma mensagem por campo.
 * Usamos isso no lugar do balão nativo do navegador (fácil de não ver).
 */
function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'register' && !name.trim()) errors.name = 'Diga como podemos te chamar.';
  if (!email.trim()) errors.email = 'Informe o seu e-mail.';
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Esse e-mail não parece válido.';
  if (!password) errors.password = 'Informe a senha.';
  else if (mode === 'register' && password.length < 8) errors.password = 'A senha precisa de pelo menos 8 caracteres.';
  return errors;
}

/**
 * Tela de entrada: "Entrar" ou "Criar conta".
 * Aparece sempre que nao ha token salvo (ou quando o token venceu).
 */
export const LoginPage: React.FC<LoginPageProps> = ({ onLoggedIn }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setError(null);
    setFieldErrors({});
    // Leva o cursor para o primeiro campo: mostra que a tela mudou e já deixa digitar.
    requestAnimationFrame(() => (m === 'register' ? refs.name : refs.email).current?.focus());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(mode, name, email, password);
    setFieldErrors(errors);
    const first = (['name', 'email', 'password'] as Field[]).find((f) => errors[f]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'login'
        ? await login(email.trim(), password)
        : await register(name.trim(), email.trim(), password);
      onLoggedIn(user, mode === 'register');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel entrar.');
    } finally {
      setBusy(false);
    }
  };

  // Apaga o erro de um campo assim que a pessoa volta a digitar nele.
  const edit = (field: Field, set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const tabClass = (m: Mode) =>
    [
      'relative z-10 flex-1 min-h-[44px] rounded-xl text-sm font-medium transition-colors duration-200',
      mode === m ? 'text-black' : 'text-neutral-400 hover:text-white',
    ].join(' ');

  const inputClass = (field: Field) =>
    'w-full min-h-[44px] rounded-xl bg-neutral-950 border px-3 py-2.5 text-base sm:text-sm text-white ' +
    'placeholder:text-neutral-600 focus:outline-none transition-colors ' +
    (fieldErrors[field] ? 'border-red-500/70 focus:border-red-400' : 'border-neutral-800 focus:border-neutral-500');

  const FieldError = ({ field }: { field: Field }) =>
    fieldErrors[field] ? (
      <span id={`${field}-error`} className="flex items-center gap-1 text-xs text-red-300 animate-[fade-in_160ms_ease-out]">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        {fieldErrors[field]}
      </span>
    ) : null;

  const errorProps = (field: Field) => ({
    'aria-invalid': !!fieldErrors[field],
    'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
  });

  const busyLabel = mode === 'login' ? 'Entrando…' : 'Criando conta…';

  return (
    <div className="relative overflow-hidden min-h-screen flex items-center justify-center text-neutral-100 px-4">
      {/* Linha d'água atrás do cartão: o login fica como a ponta do iceberg */}
      <WaterLine level={0.6} intensity={2.2} speed={2} />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <Logo className="h-24 w-24 sm:h-32 sm:w-32 mx-auto mb-2 text-neutral-100" />
          <h1 className="text-2xl font-semibold text-neutral-100 tracking-[-0.02em]">
            Deep <em className="font-serif font-normal text-[1.15em] text-accent">thinker</em>
          </h1>
          {/* key: o texto troca com um fade curto, assim a mudança de aba se nota */}
          <p key={mode} className="text-sm text-neutral-400 animate-[fade-in_200ms_ease-out]">
            {mode === 'login' ? 'Entre para ver as suas notas.' : 'Crie sua conta para começar.'}
          </p>
        </div>

        <div role="tablist" aria-label="Entrar ou criar conta" className="relative flex gap-1 p-1 rounded-2xl bg-neutral-900 border border-neutral-800">
          {/* Pílula branca que desliza para a aba ativa */}
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-6px)] rounded-xl bg-white transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: mode === 'register' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }}
          />
          <button type="button" role="tab" aria-selected={mode === 'login'} className={tabClass('login')} onClick={() => switchMode('login')}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={tabClass('register')} onClick={() => switchMode('register')}>
            Criar conta
          </button>
        </div>

        <form
          onSubmit={submit}
          noValidate
          aria-busy={busy}
          className="space-y-3 rounded-2xl bg-neutral-900/90 backdrop-blur-sm border border-neutral-800 p-4"
        >
          {mode === 'register' && (
            <label className="block space-y-1 animate-[fade-in_200ms_ease-out]">
              <span className="text-xs text-neutral-400">Nome</span>
              <input
                ref={refs.name}
                className={inputClass('name')}
                value={name}
                onChange={edit('name', setName)}
                autoComplete="name"
                maxLength={100}
                {...errorProps('name')}
              />
              <FieldError field="name" />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">E-mail</span>
            <input
              ref={refs.email}
              className={inputClass('email')}
              type="email"
              inputMode="email"
              value={email}
              onChange={edit('email', setEmail)}
              autoComplete="email"
              {...errorProps('email')}
            />
            <FieldError field="email" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Senha</span>
            <input
              ref={refs.password}
              className={inputClass('password')}
              type="password"
              value={password}
              onChange={edit('password', setPassword)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={72}
              {...errorProps('password')}
            />
            {fieldErrors.password ? (
              <FieldError field="password" />
            ) : (
              mode === 'register' && <span className="block text-[11px] text-neutral-500">Pelo menos 8 caracteres.</span>
            )}
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-950/30 p-2.5 text-xs text-red-300 animate-[fade-in_160ms_ease-out]">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-white text-black py-2.5 text-sm font-semibold hover:bg-neutral-200 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-70 disabled:cursor-wait"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {busy ? busyLabel : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
};
