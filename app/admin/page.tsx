'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, Eye, EyeOff, KeyRound, LockKeyhole, LogOut, Mail, Search, X } from 'lucide-react';
import type { DiscTestRecord } from '@/lib/disc-types';
import { formatDateTime, onlyDigits } from '@/lib/normalization';
import { cn } from '@/lib/utils';

type AuthState = 'loading' | 'setup' | 'login' | 'reset' | 'ready' | 'error';
type SortMode = 'newest' | 'oldest';

const sortLabels: Record<SortMode, string> = {
  newest: 'Mais novo primeiro',
  oldest: 'Mais antigo primeiro',
};

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [tests, setTests] = useState<DiscTestRecord[]>([]);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);

  const loadTests = useCallback(async () => {
    setLoadingTests(true);
    try {
      const response = await fetch('/api/admin/tests');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao buscar testes.');
      setTests(payload.tests || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao buscar testes.');
      if ((error instanceof Error ? error.message : '').includes('autorizado')) setAuthState('login');
    } finally {
      setLoadingTests(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/status');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao carregar status.');

      if (payload.authenticated) {
        setAuthState('ready');
        await loadTests();
      } else {
        setAuthState(payload.setupRequired ? 'setup' : 'login');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar admin.');
      setAuthState('error');
    }
  }, [loadTests]);

  useEffect(() => {
    // Initial server auth check for this client-only dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  async function submitPassword() {
    setMessage('');
    setSuccessMessage('');

    if ((authState === 'setup' || authState === 'reset') && password !== confirmPassword) {
      setMessage('As senhas não conferem.');
      return;
    }

    const endpoint = authState === 'setup' ? '/api/admin/setup' : '/api/admin/login';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || 'Senha recusada.');
      return;
    }

    if (authState === 'setup' && payload.recoveryCode) {
      setRecoveryNotice(`Guarde este código de recuperação em local seguro: ${payload.recoveryCode}`);
    }

    setEmail(payload.email || email);
    setPassword('');
    setConfirmPassword('');
    setAuthState('ready');
    await loadTests();
  }

  async function submitResetPassword() {
    setMessage('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setMessage('As senhas não conferem.');
      return;
    }

    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, recoveryCode, password }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || 'Não foi possível redefinir a senha.');
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setRecoveryCode('');
    setSuccessMessage('Senha redefinida. Entre com sua nova senha.');
    setAuthState('login');
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setTests([]);
    setAuthState('login');
  }

  const filteredTests = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const digits = onlyDigits(query);
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return tests
      .filter((test) => {
        const time = new Date(test.timestamp).getTime();
        const matchesQuery =
          !needle ||
          test.leadData.nomeCompleto.includes(needle) ||
          test.primaryProfile.toUpperCase().includes(needle) ||
          test.secondaryProfile.toUpperCase().includes(needle) ||
          (digits && test.phoneDigits.includes(digits));
        const matchesFrom = from === null || time >= from;
        const matchesTo = to === null || time <= to;
        return matchesQuery && matchesFrom && matchesTo;
      })
      .sort((a, b) => {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        return sortMode === 'newest' ? diff : -diff;
      });
  }, [fromDate, query, sortMode, tests, toDate]);

  if (authState !== 'ready') {
    const isSetup = authState === 'setup';
    const isReset = authState === 'reset';
    const authTitle = isSetup ? 'CRIAR CONTA MASTER' : isReset ? 'REDEFINIR SENHA' : authState === 'loading' ? 'CARREGANDO' : 'ACESSO RESTRITO';
    const authDescription = isSetup
      ? 'Primeiro acesso: cadastre o e-mail e a senha da conta admin master. Depois disso, novos cadastros ficam bloqueados.'
      : isReset
        ? 'Use o e-mail admin master e o código de recuperação criado no primeiro acesso.'
        : 'Entre com o e-mail e a senha da conta admin master.';
    const canSubmit =
      authState === 'login'
        ? Boolean(email.trim() && password)
        : isSetup
          ? Boolean(email.trim() && password.length >= 8 && confirmPassword.length >= 8)
          : isReset
            ? Boolean(email.trim() && recoveryCode.trim() && password.length >= 8 && confirmPassword.length >= 8)
            : false;

    return (
      <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md border border-border bg-panel/40 rounded-xl p-8">
          <div className="flex items-center gap-3 text-primary mb-6">
            <LockKeyhole size={24} />
            <span className="text-xs font-mono uppercase tracking-widest">Admin Landi Turbina</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-2">{authTitle}</h1>
          <p className="text-sm text-foreground/60 mb-7">{authDescription}</p>
          {authState !== 'loading' && authState !== 'error' && (
            <div className="space-y-4">
              <label className="relative block">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full bg-[#111111] border border-border rounded-lg outline-none pl-10 pr-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60" placeholder="E-mail admin" autoComplete="email" />
              </label>

              {isReset && (
                <label className="relative block">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
                  <input type="text" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} className="w-full bg-[#111111] border border-border rounded-lg outline-none pl-10 pr-4 py-3 text-white uppercase focus:border-primary/60 focus:ring-1 focus:ring-primary/60" placeholder="Código de recuperação" autoComplete="one-time-code" />
                </label>
              )}

              <label className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                  onKeyDown={(event) => {
                    setCapsLockOn(event.getModifierState('CapsLock'));
                    if (event.key === 'Enter') void (isReset ? submitResetPassword() : submitPassword());
                  }}
                  className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 pr-12 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
                  placeholder={isReset ? 'Nova senha' : 'Senha'}
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-white" aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </label>

              {(isSetup || isReset) && (
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))} className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60" placeholder="Confirmar senha" autoComplete="new-password" />
              )}

              {capsLockOn && <p className="text-xs font-mono text-primary uppercase">Caps Lock está ligado.</p>}
              {(isSetup || isReset) && <p className="text-xs text-foreground/45">A senha precisa ter pelo menos 8 caracteres.</p>}

              <button onClick={isReset ? submitResetPassword : submitPassword} disabled={!canSubmit} className="w-full py-3 rounded-lg bg-primary text-white font-display font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {isSetup ? 'CRIAR CONTA MASTER' : isReset ? 'REDEFINIR SENHA' : 'ENTRAR'}
              </button>

              {!isSetup && (
                <button type="button" onClick={() => { setMessage(''); setSuccessMessage(''); setAuthState(isReset ? 'login' : 'reset'); }} className="w-full text-sm text-foreground/60 hover:text-white">
                  {isReset ? 'Voltar para o login' : 'Esqueci minha senha'}
                </button>
              )}
            </div>
          )}
          {successMessage && <p className="mt-5 text-sm text-green-400">{successMessage}</p>}
          {message && <p className="mt-5 text-sm text-red-400">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-black/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-primary uppercase tracking-widest">Dashboard administrativo</p>
            <h1 className="font-display text-3xl font-bold text-white mt-1">RESULTADOS DISC</h1>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground/80 hover:text-white hover:border-white/20">
            <LogOut size={16} /> SAIR
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {recoveryNotice && (
          <div className="mb-6 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm text-white">
            <p className="font-display text-base font-semibold">Conta master criada.</p>
            <p className="mt-1 text-foreground/80">{recoveryNotice}</p>
            <button onClick={() => setRecoveryNotice('')} className="mt-3 text-xs font-mono uppercase text-primary hover:text-white">
              Já guardei o código
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_210px_210px_220px] gap-3 mb-6">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full h-14 bg-panel/60 border border-border rounded-lg pl-10 pr-4 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-foreground/45" placeholder="Filtrar por nome, telefone ou perfil" />
          </label>
          <DateFilter label="Data inicial" value={fromDate} onChange={setFromDate} />
          <DateFilter label="Data final" value={toDate} onChange={setToDate} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((value) => !value)}
              onBlur={() => window.setTimeout(() => setSortOpen(false), 120)}
              className={cn(
                'h-14 w-full rounded-lg border bg-panel/60 px-4 text-left outline-none transition-all',
                'hover:border-white/35 focus:border-primary/70 focus:ring-1 focus:ring-primary/50',
                sortOpen ? 'border-primary/70 shadow-[0_0_0_1px_rgba(188,15,36,0.25)]' : 'border-border',
              )}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              <span className="block text-[10px] font-mono uppercase tracking-widest text-foreground/40">Ordenar</span>
              <span className="mt-0.5 flex items-center justify-between gap-3 text-sm font-medium text-white">
                {sortLabels[sortMode]}
                <ChevronDown size={16} className={cn('text-foreground/45 transition-transform', sortOpen && 'rotate-180 text-primary')} />
              </span>
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden rounded-lg border border-border bg-[#111111] shadow-2xl shadow-black/50" role="listbox">
                {(['newest', 'oldest'] as SortMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSortMode(option);
                      setSortOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors',
                      sortMode === option ? 'bg-primary text-white' : 'text-foreground/80 hover:bg-white/5 hover:text-white',
                    )}
                    role="option"
                    aria-selected={sortMode === option}
                  >
                    {sortLabels[option]}
                    {sortMode === option && <Check size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-foreground/55">{loadingTests ? 'Carregando...' : `${filteredTests.length} resultado(s) exibido(s)`}</p>
          <button onClick={loadTests} className="text-sm text-foreground/65 hover:text-white">Atualizar</button>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-panel/80 text-xs font-mono uppercase text-foreground/45">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">D</th>
                <th className="px-4 py-3">I</th>
                <th className="px-4 py-3">S</th>
                <th className="px-4 py-3">C</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((test) => (
                <tr key={test.id} className="border-t border-border/80 hover:bg-white/[0.03]">
                  <td className="px-4 py-4 font-medium text-white">{test.leadData.nomeCompleto}</td>
                  <td className="px-4 py-4 font-mono text-sm text-foreground/70">{test.leadData.telefone || test.phoneDigits}</td>
                  <td className="px-4 py-4 font-mono text-sm text-foreground/70">{formatDateTime(test.timestamp)}</td>
                  <td className="px-4 py-4">
                    <span className="rounded bg-primary/10 text-primary px-2 py-1 text-xs font-mono">{test.primaryProfile} / {test.secondaryProfile}</span>
                  </td>
                  {(['D', 'I', 'S', 'C'] as const).map((factor) => (
                    <td key={factor} className={cn('px-4 py-4 font-mono text-sm', test.percentages[factor] >= 30 ? 'text-white' : 'text-foreground/60')}>{test.percentages[factor]}%</td>
                  ))}
                </tr>
              ))}
              {!filteredTests.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-foreground/45">Nenhum resultado encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="group relative block">
      <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35 transition-colors group-focus-within:text-primary" size={16} />
      <span className="pointer-events-none absolute left-10 top-2 text-[10px] font-mono uppercase tracking-widest text-foreground/40">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-14 w-full rounded-lg border border-border bg-panel/60 pb-2 pl-10 pr-10 pt-6 text-sm font-medium text-white outline-none transition-all',
          'hover:border-white/35 focus:border-primary/70 focus:ring-1 focus:ring-primary/50',
          '[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-foreground/45 hover:bg-white/5 hover:text-white"
          aria-label={`Limpar ${label.toLowerCase()}`}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
