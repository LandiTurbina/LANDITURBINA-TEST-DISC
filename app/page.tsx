'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Download, FileText, Search, TrendingUp, UserRound } from 'lucide-react';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Factor, calculateDiscResult, discQuestions, shuffleArray } from '@/lib/disc-engine';
import type { DiscTestRecord, LeadData } from '@/lib/disc-types';
import { formatDateTime, normalizeName, onlyDigits, phoneMask } from '@/lib/normalization';
import { cn } from '@/lib/utils';

type AppState = 'splash' | 'onboarding' | 'history' | 'test' | 'completed';

type ComparableTest = Pick<DiscTestRecord, 'id' | 'timestamp' | 'leadData' | 'phoneDigits' | 'percentages' | 'primaryProfile' | 'secondaryProfile'>;

const emptyUser: LeadData = { nomeCompleto: '', telefone: '' };
const factorLabels: Record<Factor, string> = {
  D: 'Executor',
  I: 'Comunicador',
  S: 'Planejador',
  C: 'Analista',
};

function nameInputValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .toUpperCase();
}

function sortOldest(tests: ComparableTest[]) {
  return [...tests].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function buildFactorDelta(previousTest: ComparableTest, result: ReturnType<typeof calculateDiscResult>) {
  return {
    D: result.percentages.D - previousTest.percentages.D,
    I: result.percentages.I - previousTest.percentages.I,
    S: result.percentages.S - previousTest.percentages.S,
    C: result.percentages.C - previousTest.percentages.C,
  };
}

function deltaText(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '=';
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('splash');
  const [userData, setUserData] = useState<LeadData>(emptyUser);
  const [answers, setAnswers] = useState<Record<string, Record<Factor, number | null>>>({});
  const [previousTests, setPreviousTests] = useState<ComparableTest[]>([]);
  const [comparisonTests, setComparisonTests] = useState<ComparableTest[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [testResult, setTestResult] = useState<ReturnType<typeof calculateDiscResult> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const randomizedQuestions = useMemo(() => {
    return discQuestions.map((q) => {
      const keys = Object.keys(q.factors) as Factor[];
      return { id: q.id, shuffledKeys: shuffleArray(keys), factors: q.factors };
    });
  }, []);

  const normalizedDisplayName = normalizeName(userData.nomeCompleto);
  const baselineTest = previousTests.length ? sortOldest(previousTests)[0] : null;
  const currentDelta = baselineTest && testResult ? buildFactorDelta(baselineTest, testResult) : null;

  useEffect(() => {
    if (appState === 'splash') {
      const timer = setTimeout(() => setAppState('onboarding'), 1800);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  const handleScoreSelect = (questionId: string, factor: Factor, score: number) => {
    setAnswers((prev) => {
      const currentQ = prev[questionId] || { D: null, I: null, S: null, C: null };
      const updatedQ = { ...currentQ };
      Object.keys(updatedQ).forEach((key) => {
        const kFactor = key as Factor;
        if (updatedQ[kFactor] === score) updatedQ[kFactor] = null;
      });
      updatedQ[factor] = currentQ[factor] === score ? null : score;
      return { ...prev, [questionId]: updatedQ };
    });
  };

  const checkIsQuestionComplete = (questionId: string) => {
    const qAnswers = answers[questionId];
    if (!qAnswers) return false;
    return qAnswers.D !== null && qAnswers.I !== null && qAnswers.S !== null && qAnswers.C !== null;
  };

  const isTestComplete = randomizedQuestions.every((q) => checkIsQuestionComplete(q.id));
  const progressPercent = Math.round(
    (Object.values(answers).reduce((acc, curr) => acc + Object.values(curr).filter((v) => v !== null).length, 0) /
      (randomizedQuestions.length * 4)) *
      100,
  );

  const handleLookup = async () => {
    if (!normalizedDisplayName || onlyDigits(userData.telefone).length < 10) return;
    setLookupLoading(true);
    setLookupError('');

    try {
      const params = new URLSearchParams({ name: normalizedDisplayName, phone: userData.telefone });
      const response = await fetch(`/api/tests/lookup?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao buscar histórico.');

      const tests = sortOldest((payload.tests || []) as ComparableTest[]);
      setPreviousTests(tests);
      setComparisonTests([]);
      setAppState(tests.length ? 'history' : 'test');
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Erro ao buscar histórico.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleFinishTest = async () => {
    if (!isTestComplete || isSaving) return;
    setIsSaving(true);

    try {
      const finalAnswers = answers as Record<string, Record<Factor, number>>;
      const result = calculateDiscResult(finalAnswers);

      const response = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { nomeCompleto: normalizedDisplayName, telefone: userData.telefone },
          answers: finalAnswers,
          result,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao gravar os dados.');

      const savedTest = payload.test as ComparableTest | undefined;
      const fallbackCurrentTest: ComparableTest = {
        id: `current_${Date.now()}`,
        timestamp: new Date().toISOString(),
        leadData: { nomeCompleto: normalizedDisplayName, telefone: userData.telefone },
        phoneDigits: onlyDigits(userData.telefone),
        percentages: result.percentages,
        primaryProfile: result.primaryProfile,
        secondaryProfile: result.secondaryProfile,
      };

      setComparisonTests(sortOldest([...previousTests, savedTest || fallbackCurrentTest]));
      setTestResult(result);
      setAppState('completed');
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Houve um erro no processamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadElementAsPDF = async (element: HTMLDivElement | null, filename: string) => {
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#0B0B0B',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('.no-print').forEach((el) => ((el as HTMLElement).style.display = 'none'));
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    while (pdfHeight + position > pdf.internal.pageSize.getHeight()) {
      position -= pdf.internal.pageSize.getHeight();
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    }

    pdf.save(filename);
  };

  const validOnboarding = normalizedDisplayName.length >= 5 && onlyDigits(userData.telefone).length >= 10;
  const hasComparison = comparisonTests.length > 1;

  return (
    <main className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-white">
      <AnimatePresence mode="wait">
        {appState === 'splash' && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.5 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0B]">
            <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={240} height={72} className="w-52 md:w-64 object-contain" priority />
          </motion.div>
        )}

        {appState === 'onboarding' && (
          <motion.section key="onboarding" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-panel/40 backdrop-blur-xl border border-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
              <h1 className="font-display font-bold text-3xl mb-2 text-white">IDENTIFIQUE-SE</h1>
              <p className="text-sm text-foreground/60 mb-8 max-w-[300px]">Informe seu nome completo e telefone para localizar resultados anteriores.</p>
              <div className="space-y-5">
                <label className="block">
                  <span className="text-xs font-mono text-foreground/50 uppercase">Nome completo</span>
                  <input type="text" required value={userData.nomeCompleto} onChange={(e) => setUserData({ ...userData, nomeCompleto: nameInputValue(e.target.value) })} onBlur={() => setUserData({ ...userData, nomeCompleto: normalizedDisplayName })} className="mt-2 w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-medium uppercase" placeholder="NOME COMPLETO" />
                </label>
                <label className="block">
                  <span className="text-xs font-mono text-foreground/50 uppercase">Telefone</span>
                  <input type="tel" required value={userData.telefone} onChange={(e) => setUserData({ ...userData, telefone: phoneMask(e.target.value) })} className="mt-2 w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-medium" placeholder="(00) 00000-0000" maxLength={15} />
                </label>
              </div>
              {lookupError && <p className="mt-4 text-sm text-red-400">{lookupError}</p>}
              <button disabled={!validOnboarding || lookupLoading} onClick={handleLookup} className="mt-10 w-full py-4 px-6 bg-primary text-white font-display font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                <Search size={18} />
                {lookupLoading ? 'BUSCANDO...' : 'CONTINUAR'}
              </button>
            </div>
          </motion.section>
        )}

        {appState === 'history' && (
          <motion.section key="history" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-3xl bg-panel/40 border border-border rounded-xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs font-mono text-primary uppercase tracking-widest">Histórico encontrado</p>
                  <h2 className="font-display text-3xl font-bold text-white mt-1">{normalizedDisplayName}</h2>
                  <p className="text-sm text-foreground/55 mt-2">
                    Encontramos {previousTests.length} teste(s) anterior(es). Ao finalizar o novo teste, o comparativo será gerado automaticamente por data, usando todo o histórico desde o primeiro registro.
                  </p>
                </div>
                <button onClick={() => setAppState('test')} className="px-5 py-3 rounded-lg bg-primary text-white font-display text-sm font-medium">INICIAR TESTE</button>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
                {previousTests.map((test, index) => {
                  const phoneChanged = test.phoneDigits && test.phoneDigits !== onlyDigits(userData.telefone);
                  return (
                    <div key={test.id} className="w-full rounded-lg border border-border bg-black/20 p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="font-display text-lg text-white">#{index + 1} - {test.primaryProfile} + {test.secondaryProfile}</p>
                          <p className="text-xs font-mono text-foreground/50 mt-1">{formatDateTime(test.timestamp)} | {test.leadData.telefone || test.phoneDigits}</p>
                        </div>
                        <div className="flex gap-2 text-xs font-mono text-foreground/70">
                          <span>D {test.percentages.D}%</span>
                          <span>I {test.percentages.I}%</span>
                          <span>S {test.percentages.S}%</span>
                          <span>C {test.percentages.C}%</span>
                        </div>
                      </div>
                      {phoneChanged && <p className="text-xs text-primary mt-3">Telefone novo detectado. Ao salvar, o cadastro por nome passa a apontar para o telefone informado agora.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.section>
        )}

        {appState === 'test' && (
          <motion.section key="test" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col items-center w-full">
            <div className="sticky top-0 w-full z-40 bg-black/80 backdrop-blur-md border-b border-white/5 pt-4">
              <div className="w-full max-w-4xl mx-auto px-4 flex justify-between items-end mb-3">
                <div>
                  <h1 className="font-display font-bold text-xl leading-none">TESTE DE PERFIL</h1>
                  <p className="text-xs font-mono text-foreground/45 mt-1">{normalizedDisplayName}</p>
                </div>
                <span className="text-xs font-mono text-foreground/50">{progressPercent}% CONCLUÍDO</span>
              </div>
              <div className="w-full h-1 bg-white/5 relative overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} className="absolute inset-y-0 left-0 bg-primary" />
              </div>
            </div>
            <div className="w-full max-w-4xl mx-auto px-4 py-8 pb-32 space-y-10">
              <div>
                <p className="text-sm md:text-base text-foreground/80">Dê notas de <strong className="text-white">1 a 4</strong> para cada linha. <strong className="text-white underline decoration-primary underline-offset-4 decoration-2">4 = mais parece com você</strong>.</p>
                <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-lg">
                  <p className="text-sm font-mono text-foreground/60 uppercase">Regra: não repita números na mesma situação. A escolha é exclusiva.</p>
                </div>
              </div>
              {randomizedQuestions.map((q, index) => {
                const qAnswers = answers[q.id] || {};
                const isComplete = checkIsQuestionComplete(q.id);
                return (
                  <div key={q.id} className={cn('flex flex-col gap-6 p-6 rounded-xl border transition-colors duration-300', isComplete ? 'border-green-900/50 bg-[#0B0B0B]' : 'border-border bg-panel/30')}>
                    <div className="flex justify-between items-center">
                      <h3 className="font-display font-bold text-xl text-white/90 uppercase tracking-wide">SITUAÇÃO {index + 1}</h3>
                      {isComplete && <span className="text-xs font-mono font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded">OK</span>}
                    </div>
                    <div className="space-y-4">
                      {q.shuffledKeys.map((factor) => {
                        const selectedScore = qAnswers[factor];
                        const usedScores = Object.values(qAnswers).filter((v) => v !== null) as number[];
                        return (
                          <div key={factor} className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 group">
                            <span className="text-[15px] leading-snug md:text-base flex-1 text-foreground/80 group-hover:text-white transition-colors">{q.factors[factor]}</span>
                            <div className="flex bg-black/40 rounded-lg p-1 w-full md:w-auto h-12 border border-white/5">
                              {[1, 2, 3, 4].map((num) => {
                                const isSelected = selectedScore === num;
                                const isUsedElseWhere = !isSelected && usedScores.includes(num);
                                return (
                                  <button key={num} onClick={() => handleScoreSelect(q.id, factor, num)} className={cn('flex-1 md:w-14 h-full flex items-center justify-center font-display font-medium rounded-md transition-all', isSelected ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[0.98]' : isUsedElseWhere ? 'opacity-20 cursor-not-allowed text-foreground/30' : 'text-foreground/60 hover:text-white hover:bg-white/5')}>
                                    {num}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-8 border-t border-border">
                <button disabled={!isTestComplete || isSaving} onClick={handleFinishTest} className={cn('px-8 py-4 font-display font-medium rounded-lg transition-all', isTestComplete && !isSaving ? 'bg-primary text-white hover:bg-primary/90 hover:-translate-y-1' : 'bg-panel text-foreground/40 cursor-not-allowed')}>
                  {isSaving ? 'PROCESSANDO...' : isTestComplete ? 'CALCULAR RESULTADO' : 'PONTUE TODAS AS SITUAÇÕES'}
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {appState === 'completed' && testResult && (
          <motion.section key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center p-4 md:p-12 w-full max-w-5xl mx-auto">
            <div ref={resultRef} className="w-full bg-[#0B0B0B] p-6 md:p-8 rounded-xl shadow-2xl">
              <div className="w-full flex flex-col md:flex-row md:justify-between md:items-center gap-5 mb-10 pb-6 border-b border-white/10">
                <div>
                  <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={140} height={40} className="w-32 md:w-40 object-contain mb-4" />
                  <h1 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-tight text-white mb-1">ANÁLISE DE PERFORMANCE</h1>
                  <p className="text-foreground/50 font-mono text-sm uppercase">{normalizedDisplayName} | {formatDateTime(new Date().toISOString())}</p>
                </div>
                <div className="no-print flex flex-wrap gap-2">
                  <button onClick={() => downloadElementAsPDF(resultRef.current, `Landi_${normalizedDisplayName.replace(/\s+/g, '_')}.pdf`)} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg px-4 py-2 font-display text-sm font-medium transition-all flex items-center gap-2">
                    <Download size={16} /> RELATÓRIO
                  </button>
                  {hasComparison && (
                    <button onClick={() => downloadElementAsPDF(comparisonRef.current, `Comparativo_${normalizedDisplayName.replace(/\s+/g, '_')}.pdf`)} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-4 py-2 font-display text-sm font-medium transition-all flex items-center gap-2">
                      <FileText size={16} /> COMPARATIVO
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                <div className="md:col-span-5 flex flex-col items-center md:items-start">
                  <div className="relative w-64 h-64 md:w-80 md:h-80 mx-auto md:mx-0 flex items-center justify-center rounded-full bg-panel p-[1px]">
                    <div className="w-full h-full rounded-full absolute inset-0" style={{ background: `conic-gradient(#BC0F24 0% ${testResult.percentages.D}%, #666666 ${testResult.percentages.D}% ${testResult.percentages.D + testResult.percentages.I}%, #333333 ${testResult.percentages.D + testResult.percentages.I}% ${testResult.percentages.D + testResult.percentages.I + testResult.percentages.S}%, #999999 ${testResult.percentages.D + testResult.percentages.I + testResult.percentages.S}% 100%)` }} />
                    <div className="w-3/4 h-3/4 rounded-full bg-background/95 relative z-10 flex flex-col items-center justify-center border border-white/5">
                      <span className="text-4xl font-display font-bold text-white leading-none">{Math.max(...Object.values(testResult.percentages))}%</span>
                      <span className="text-xs uppercase font-mono text-primary mt-1 tracking-widest">{testResult.primaryProfile}</span>
                    </div>
                  </div>
                  <div className="w-full mt-8 grid grid-cols-2 gap-3">
                    {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                      <div key={factor} className="bg-panel/30 border border-border p-4 rounded-lg flex flex-col items-center relative">
                        <span className="text-lg font-mono font-medium text-white">{testResult.percentages[factor]}%</span>
                        <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">{factorLabels[factor]}</span>
                        {currentDelta && <span className={cn('absolute top-2 right-2 text-[10px] font-mono', currentDelta[factor] > 0 ? 'text-green-500' : currentDelta[factor] < 0 ? 'text-red-500' : 'text-white/30')}>{deltaText(currentDelta[factor])}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-7 flex flex-col justify-center space-y-6">
                  <div>
                    <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-2">DIAGNÓSTICO</h3>
                    <h2 className="font-display font-bold text-4xl md:text-5xl uppercase tracking-tighter text-white leading-[0.9]">
                      {testResult.combinedString.split('-')[0]} <br />
                      <span className="text-white/40">{testResult.combinedString.split('-')[1]}</span>
                    </h2>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 p-6 md:p-8 rounded-xl relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-xl" />
                    <p className="text-lg md:text-xl text-foreground font-medium leading-relaxed">&quot;{testResult.reportCopy}&quot;</p>
                  </div>
                  {hasComparison ? (
                    <ComparisonBlock refProp={comparisonRef} normalizedDisplayName={normalizedDisplayName} comparisonTests={comparisonTests} />
                  ) : (
                    <div className="bg-panel/50 border border-border p-6 rounded-xl">
                      <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest mb-2">Primeiro registro</h4>
                      <p className="text-sm text-foreground/75">Este é o primeiro teste DISC localizado para este cadastro. O próximo resultado já terá comparativo completo por data.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function ComparisonBlock({ refProp, normalizedDisplayName, comparisonTests }: { refProp: React.RefObject<HTMLDivElement | null>; normalizedDisplayName: string; comparisonTests: ComparableTest[] }) {
  const orderedTests = sortOldest(comparisonTests);
  const first = orderedTests[0];
  const previous = orderedTests[orderedTests.length - 2];
  const current = orderedTests[orderedTests.length - 1];
  const totalDelta = buildFactorDelta(first, {
    percentages: current.percentages,
  } as ReturnType<typeof calculateDiscResult>);
  const lastDelta = buildFactorDelta(previous, {
    percentages: current.percentages,
  } as ReturnType<typeof calculateDiscResult>);
  const biggestShift = (Object.keys(totalDelta) as Factor[]).sort((a, b) => Math.abs(totalDelta[b]) - Math.abs(totalDelta[a]))[0];
  const profileChanges = orderedTests.reduce((acc, test, index) => {
    if (index === 0) return acc;
    return orderedTests[index - 1].primaryProfile !== test.primaryProfile ? acc + 1 : acc;
  }, 0);

  return (
    <div ref={refProp} className="bg-panel/50 border border-border p-6 rounded-xl relative overflow-hidden">
      <div className="flex items-start gap-3 mb-5">
        <CalendarDays className="text-primary mt-0.5" size={18} />
        <div>
          <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest">Comparativo histórico completo</h4>
          <p className="text-sm text-white mt-1">{normalizedDisplayName}</p>
          <p className="text-xs text-foreground/50">
            {orderedTests.length} testes analisados entre {formatDateTime(first.timestamp)} e {formatDateTime(current.timestamp)}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Total de testes" value={`${orderedTests.length}`} detail="inclui o resultado atual" />
        <SummaryCard label="Perfil inicial" value={first.primaryProfile} detail={`${first.secondaryProfile} como apoio`} />
        <SummaryCard label="Perfil atual" value={current.primaryProfile} detail={`${current.secondaryProfile} como apoio`} />
        <SummaryCard label="Trocas de perfil" value={`${profileChanges}`} detail="mudanças de perfil primário" />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/25 p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-primary" />
          <h5 className="font-display text-sm text-white uppercase">Leitura da evolução</h5>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Desde o primeiro teste, o eixo com maior movimentação foi <span className="font-bold text-white">{factorLabels[biggestShift]}</span>, com variação de <span className={cn('font-bold', totalDelta[biggestShift] > 0 ? 'text-green-500' : totalDelta[biggestShift] < 0 ? 'text-red-500' : 'text-white')}>{deltaText(totalDelta[biggestShift])} p.p.</span>. No comparativo mais recente, o perfil saiu de <span className="font-bold text-white">{previous.primaryProfile}</span> para <span className="font-bold text-primary">{current.primaryProfile}</span>{previous.primaryProfile === current.primaryProfile ? ', mantendo o mesmo eixo principal.' : ', indicando mudança no eixo principal.'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
          <div key={factor} className="rounded-lg bg-black/30 border border-white/10 p-3">
            <p className="text-xs font-mono text-foreground/45">{factorLabels[factor]}</p>
            <p className="text-sm text-foreground/60 mt-1">Primeiro: <span className="text-white font-mono">{first.percentages[factor]}%</span></p>
            <p className="text-sm text-foreground/60">Atual: <span className="text-white font-mono">{current.percentages[factor]}%</span></p>
            <p className={cn('text-xs font-mono mt-2', totalDelta[factor] > 0 ? 'text-green-500' : totalDelta[factor] < 0 ? 'text-red-500' : 'text-foreground/45')}>
              Total {deltaText(totalDelta[factor])} p.p. | Último {deltaText(lastDelta[factor])} p.p.
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-white/[0.03] text-xs font-mono uppercase text-foreground/45">
            <tr>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Perfil</th>
              <th className="px-3 py-3">D</th>
              <th className="px-3 py-3">I</th>
              <th className="px-3 py-3">S</th>
              <th className="px-3 py-3">C</th>
            </tr>
          </thead>
          <tbody>
            {orderedTests.map((test, index) => (
              <tr key={test.id} className="border-t border-white/10">
                <td className="px-3 py-3 font-mono text-foreground/70">{formatDateTime(test.timestamp)}</td>
                <td className="px-3 py-3 text-white">{index + 1}. {test.primaryProfile} / {test.secondaryProfile}</td>
                {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                  <td key={factor} className="px-3 py-3 font-mono text-foreground/80">{test.percentages[factor]}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs text-foreground/45">
        <UserRound size={14} />
        Comparativo gerado automaticamente a partir de todos os testes encontrados por nome completo ou telefone.
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-foreground/45">{label}</p>
      <p className="text-lg font-display font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-foreground/45 mt-1">{detail}</p>
    </div>
  );
}
