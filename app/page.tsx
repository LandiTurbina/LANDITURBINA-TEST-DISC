'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Factor, discQuestions, shuffleArray, calculateDiscResult } from '@/lib/disc-engine';
import { saveDiscResult, getPreviousTest } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type AppState = 'splash' | 'onboarding' | 'test' | 'completed';

interface UserData {
  nome: string;
  sobrenome: string;
  telefone: string;
}

const phoneMask = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

export default function Home() {
  const [appState, setAppState] = useState<AppState>('splash');
  const [userData, setUserData] = useState<UserData>({ nome: '', sobrenome: '', telefone: '' });
  const [answers, setAnswers] = useState<Record<string, Record<Factor, number | null>>>({});
  
  const randomizedQuestions = useMemo(() => {
    return discQuestions.map(q => {
      const keys = Object.keys(q.factors) as Factor[];
      return { id: q.id, shuffledKeys: shuffleArray(keys), factors: q.factors };
    });
  }, []);

  const [testResult, setTestResult] = useState<any>(null);
  const [historicDelta, setHistoricDelta] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appState === 'splash') {
      const timer = setTimeout(() => { setAppState('onboarding'); }, 2500);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  const handleScoreSelect = (questionId: string, factor: Factor, score: number) => {
    setAnswers(prev => {
      const currentQ = prev[questionId] || { D: null, I: null, S: null, C: null };
      const updatedQ = { ...currentQ };
      Object.keys(updatedQ).forEach((k) => {
        const kFactor = k as Factor;
        if (updatedQ[kFactor] === score) updatedQ[kFactor] = null;
      });
      if (currentQ[factor] === score) {
         updatedQ[factor] = null;
      } else {
         updatedQ[factor] = score;
      }
      return { ...prev, [questionId]: updatedQ };
    });
  };

  const checkIsQuestionComplete = (questionId: string) => {
    const qAnswers = answers[questionId];
    if (!qAnswers) return false;
    return qAnswers.D !== null && qAnswers.I !== null && qAnswers.S !== null && qAnswers.C !== null;
  };

  const isTestComplete = randomizedQuestions.every(q => checkIsQuestionComplete(q.id));
  const progressPercent = Math.round((Object.values(answers).reduce((acc, curr) => {
    return acc + Object.values(curr).filter(v => v !== null).length;
  }, 0) / (randomizedQuestions.length * 4)) * 100);

  const handleFinishTest = async () => {
    if (!isTestComplete || isSaving) return;
    setIsSaving(true);
    try {
      const finalAnswers = answers as Record<string, Record<Factor, number>>;
      const result = calculateDiscResult(finalAnswers);
      const previousTest = await getPreviousTest(userData.telefone);
      if (previousTest) {
        const prevPercents = previousTest.percentages;
        const currPercents = result.percentages;
        setHistoricDelta({
          D: currPercents.D - prevPercents.D,
          I: currPercents.I - prevPercents.I,
          S: currPercents.S - prevPercents.S,
          C: currPercents.C - prevPercents.C,
          changedProfile: previousTest.primaryProfile !== result.primaryProfile
            ? { from: previousTest.primaryProfile, to: result.primaryProfile }
            : null,
          previousDate: previousTest.timestamp ? new Date(previousTest.timestamp).toLocaleDateString() : 'Anterior'
        });
      }
      const finalData = { user: userData, answers: finalAnswers, result };
      const success = await saveDiscResult(finalData);
      
      if (success) {
        setTestResult(result);
        setAppState('completed');
      } else {
        alert("Erro ao gravar os dados. Tente novamente.");
      }
    } catch (e) {
      console.error(e);
      alert("Houve um erro no processamento.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!resultRef.current) return;
    const element = resultRef.current;
    
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#0B0B0B',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        const noPrintElements = clonedDoc.querySelectorAll('.no-print');
        noPrintElements.forEach(el => (el as HTMLElement).style.display = 'none');
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Landi_Performance_${userData.nome.replace(/\s+/g, '')}.pdf`);
  };

  return (
    <main className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-white">
      <AnimatePresence mode="wait">
        {appState === 'splash' && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.6, ease: "easeInOut" }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0B0B]">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }} className="flex flex-col items-center gap-4">
              <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={200} height={60} className="w-48 md:w-64 object-contain" priority />
            </motion.div>
          </motion.div>
        )}

        {appState === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.5 }} className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-panel/30 backdrop-blur-xl border border-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />
              <h2 className="font-display font-bold text-3xl mb-2 text-white">IDENTIFIQUE-SE</h2>
              <p className="text-sm text-foreground/60 mb-8 max-w-[280px]">Antes de dar a partida, deixe seu nome no registro.</p>
              <div className="space-y-5">
                <div className="relative group">
                  <input type="text" required value={userData.nome} onChange={(e) => setUserData({...userData, nome: e.target.value})} className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white placeholder:text-transparent peer focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-medium" placeholder="Nome" />
                  <label className="absolute left-4 top-3 text-sm text-foreground/40 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary peer-focus:bg-panel peer-focus:px-1 peer-valid:-top-2.5 peer-valid:text-xs peer-valid:text-foreground/60 peer-valid:bg-panel peer-valid:px-1 pointer-events-none">Nome</label>
                </div>
                <div className="relative group">
                  <input type="text" required value={userData.sobrenome} onChange={(e) => setUserData({...userData, sobrenome: e.target.value})} className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white placeholder:text-transparent peer focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-medium" placeholder="Sobrenome" />
                  <label className="absolute left-4 top-3 text-sm text-foreground/40 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary peer-focus:bg-panel peer-focus:px-1 peer-valid:-top-2.5 peer-valid:text-xs peer-valid:text-foreground/60 peer-valid:bg-panel peer-valid:px-1 pointer-events-none">Sobrenome</label>
                </div>
                <div className="relative group">
                  <input type="tel" required value={userData.telefone} onChange={(e) => setUserData({...userData, telefone: phoneMask(e.target.value)})} className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white placeholder:text-transparent peer focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-medium" placeholder="Telefone" maxLength={15} />
                  <label className="absolute left-4 top-3 text-sm text-foreground/40 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary peer-focus:bg-panel peer-focus:px-1 peer-valid:-top-2.5 peer-valid:text-xs peer-valid:text-foreground/60 peer-valid:bg-panel peer-valid:px-1 pointer-events-none">Telefone</label>
                </div>
              </div>
              <div className="mt-10">
                <button disabled={!userData.nome || !userData.sobrenome || userData.telefone.length < 14} onClick={() => setAppState('test')} className="w-full py-4 px-6 bg-primary text-white font-display font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(188,15,36,0)] hover:shadow-[0_0_20px_rgba(188,15,36,0.3)] hover:-translate-y-0.5 active:translate-y-0">INICIAR TESTE</button>
              </div>
            </div>
          </motion.div>
        )}

        {appState === 'test' && (
          <motion.div key="test" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4 }} className="flex-1 flex flex-col items-center w-full">
            <div className="sticky top-0 w-full z-40 bg-black/80 backdrop-blur-md border-b border-white/5 pt-4 pb-0">
              <div className="w-full max-w-4xl mx-auto px-4 flex justify-between items-end mb-3">
                <div><h1 className="font-display font-bold text-xl leading-none">TESTE DE PERFIL</h1></div>
                <span className="text-xs font-mono text-foreground/50">{progressPercent}% CONCLUÍDO</span>
              </div>
              <div className="w-full h-1 bg-white/5 relative overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ ease: "easeOut", duration: 0.3 }} className="absolute inset-y-0 left-0 bg-primary" />
              </div>
            </div>
            <div className="w-full max-w-4xl mx-auto px-4 py-8 pb-32 space-y-12">
              <div className="mb-8">
                <p className="text-sm md:text-base text-foreground/80">Dê notas de <strong className="text-white">1 a 4</strong> para cada linha. <br className="hidden md:block"/><strong className="text-white underline decoration-primary underline-offset-4 decoration-2">4 = Mais parece com você</strong>.</p>
                <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-lg flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                  <p className="text-sm font-mono text-foreground/60 leading-relaxed uppercase">REGRA: NÃO REPITA NÚMEROS NA MESMA PERGUNTA. A ESCOLHA É EXCLUSIVA.</p>
                </div>
              </div>
              {randomizedQuestions.map((q, index) => {
                const qAnswers = answers[q.id] || {};
                const isComplete = checkIsQuestionComplete(q.id);
                return (
                  <div key={q.id} className={cn("flex flex-col gap-6 p-6 rounded-xl border transition-colors duration-300", isComplete ? "border-green-900/50 bg-[#0B0B0B]" : "border-border bg-panel/30")}>
                    <div className="flex justify-between items-center mb-2">
                       <h3 className="font-display font-bold text-xl text-white/90 uppercase tracking-wide">SITUAÇÃO {index + 1}</h3>
                       {isComplete && <span className="text-xs font-mono font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded">OK</span>}
                    </div>
                    <div className="space-y-4">
                      {q.shuffledKeys.map((factor) => {
                        const selectedScore = qAnswers[factor];
                        const usedScores = Object.values(qAnswers).filter(v => v !== null) as number[];
                        return (
                          <div key={factor} className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 group">
                            <span className="text-[15px] leading-snug md:text-base flex-1 text-foreground/80 group-hover:text-white transition-colors">{q.factors[factor]}</span>
                            <div className="flex bg-black/40 rounded-lg p-1 w-full md:w-auto h-12 border border-white/5">
                              {[1, 2, 3, 4].map(num => {
                                const isSelected = selectedScore === num;
                                const isUsedElseWhere = !isSelected && usedScores.includes(num);
                                return (
                                  <button key={num} onClick={() => handleScoreSelect(q.id, factor, num)} data-factor={factor} className={cn("flex-1 md:w-14 h-full flex items-center justify-center font-display font-medium text-sm md:text-base rounded-md transition-all duration-200", isSelected ? "bg-primary text-white shadow-md shadow-primary/20 scale-[0.98]" : isUsedElseWhere ? "opacity-20 cursor-not-allowed text-foreground/30" : "text-foreground/60 hover:text-white hover:bg-white/5")}>
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
              <div className="flex justify-end pt-8 border-t border-border mt-12">
                 <button disabled={!isTestComplete || isSaving} onClick={handleFinishTest} className={cn("px-8 py-4 font-display font-medium rounded-lg transition-all", isTestComplete && !isSaving ? "bg-primary text-white hover:bg-primary/90 shadow-[0_0_15px_rgba(188,15,36,0.3)] hover:-translate-y-1" : "bg-panel text-foreground/40 cursor-not-allowed")}>
                   {isSaving ? "PROCESSANDO..." : isTestComplete ? "CALCULAR RESULTADO" : "PONTUE TODAS AS SITUAÇÕES"}
                 </button>
              </div>
            </div>
          </motion.div>
        )}

        {appState === 'completed' && testResult && (
           <motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-start p-4 md:p-12 w-full max-w-5xl mx-auto">
             <div ref={resultRef} className="w-full bg-[#0B0B0B] p-6 md:p-8 rounded-xl shadow-2xl relative">
             <div className="w-full flex justify-between items-center mb-10 pb-6 border-b border-white/10">
               <div>
                  <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={140} height={40} className="w-32 md:w-40 object-contain mb-4" />
                  <h1 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-tight text-white mb-1">ANÁLISE DE PERFORMANCE</h1>
                  <p className="text-foreground/50 font-mono text-sm uppercase">LEAD: {userData.nome} {userData.sobrenome}</p>
               </div>
               <button onClick={handleDownloadPDF} className="no-print bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg px-4 py-2 font-display text-sm font-medium transition-all flex items-center gap-2">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> BAIXAR RELATÓRIO
               </button>
             </div>
             <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                <div className="md:col-span-5 flex flex-col items-center md:items-start">
                   <div className="relative w-64 h-64 md:w-80 md:h-80 mx-auto md:mx-0 flex items-center justify-center rounded-full bg-panel p-[1px] shadow-[0_0_40px_rgba(188,15,36,0.1)]">
                      <div className="w-full h-full rounded-full absolute inset-0 style-donut" style={{ background: `conic-gradient(#BC0F24 0% ${testResult.percentages.D}%, #666666 ${testResult.percentages.D}% ${testResult.percentages.D + testResult.percentages.I}%, #333333 ${testResult.percentages.D + testResult.percentages.I}% ${testResult.percentages.D + testResult.percentages.I + testResult.percentages.S}%, #999999 ${testResult.percentages.D + testResult.percentages.I + testResult.percentages.S}% 100%)` }} />
                      <div className="w-3/4 h-3/4 rounded-full bg-background/95 backdrop-blur-xl relative z-10 flex flex-col items-center justify-center border border-white/5 shadow-inner">
                        <span className="text-4xl font-display font-bold text-white leading-none">{testResult.percentages[Object.keys(testResult.percentages).reduce((a, b) => testResult.percentages[a as Factor] > testResult.percentages[b as Factor] ? a : b) as Factor]}%</span>
                        <span className="text-xs uppercase font-mono text-primary mt-1 tracking-widest">{testResult.primaryProfile}</span>
                      </div>
                   </div>
                   <div className="w-full mt-8 grid grid-cols-2 gap-3">
                     <div className="bg-panel/30 border border-border p-4 rounded-lg flex flex-col items-center relative">
                        <div className="w-3 h-3 rounded-full bg-[#BC0F24] mb-2" />
                        <span className="text-lg font-mono font-medium text-white">{testResult.percentages.D}%</span>
                        <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">Executor</span>
                        {historicDelta && <span className={cn("absolute top-2 right-2 text-[10px] font-mono", historicDelta.D > 0 ? "text-green-500" : historicDelta.D < 0 ? "text-red-500" : "text-white/30")}>{historicDelta.D > 0 ? `+${historicDelta.D}` : historicDelta.D < 0 ? historicDelta.D : '='}</span>}
                     </div>
                     <div className="bg-panel/30 border border-border p-4 rounded-lg flex flex-col items-center relative">
                        <div className="w-3 h-3 rounded-full bg-[#666666] mb-2" />
                        <span className="text-lg font-mono font-medium text-white">{testResult.percentages.I}%</span>
                        <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">Comunicador</span>
                        {historicDelta && <span className={cn("absolute top-2 right-2 text-[10px] font-mono", historicDelta.I > 0 ? "text-green-500" : historicDelta.I < 0 ? "text-red-500" : "text-white/30")}>{historicDelta.I > 0 ? `+${historicDelta.I}` : historicDelta.I < 0 ? historicDelta.I : '='}</span>}
                     </div>
                     <div className="bg-panel/30 border border-border p-4 rounded-lg flex flex-col items-center relative">
                        <div className="w-3 h-3 rounded-full bg-[#333333] mb-2" />
                        <span className="text-lg font-mono font-medium text-white">{testResult.percentages.S}%</span>
                        <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">Planejador</span>
                        {historicDelta && <span className={cn("absolute top-2 right-2 text-[10px] font-mono", historicDelta.S > 0 ? "text-green-500" : historicDelta.S < 0 ? "text-red-500" : "text-white/30")}>{historicDelta.S > 0 ? `+${historicDelta.S}` : historicDelta.S < 0 ? historicDelta.S : '='}</span>}
                     </div>
                     <div className="bg-panel/30 border border-border p-4 rounded-lg flex flex-col items-center relative">
                        <div className="w-3 h-3 rounded-full bg-[#999999] mb-2" />
                        <span className="text-lg font-mono font-medium text-white">{testResult.percentages.C}%</span>
                        <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">Analista</span>
                        {historicDelta && <span className={cn("absolute top-2 right-2 text-[10px] font-mono", historicDelta.C > 0 ? "text-green-500" : historicDelta.C < 0 ? "text-red-500" : "text-white/30")}>{historicDelta.C > 0 ? `+${historicDelta.C}` : historicDelta.C < 0 ? historicDelta.C : '='}</span>}
                     </div>
                   </div>
                </div>
                <div className="md:col-span-7 flex flex-col justify-center space-y-6">
                  <div>
                    <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-2">DIAGNÓSTICO</h3>
                    <h2 className="font-display font-bold text-4xl md:text-5xl uppercase tracking-tighter text-white leading-[0.9]">
                      {testResult.combinedString.split('-')[0]} <br/>
                      <span className="text-white/40">{testResult.combinedString.split('-')[1]}</span>
                    </h2>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 p-6 md:p-8 rounded-xl relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-xl" />
                    <p className="text-lg md:text-xl text-foreground font-medium leading-relaxed">&quot;{testResult.reportCopy}&quot;</p>
                  </div>
                  {historicDelta && (
                    <div className="bg-panel/50 border border-border p-6 rounded-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-full rotate-45 -mr-10 -mt-10 blur-xl pointer-events-none" />
                      <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest mb-3">EVOLUÇÃO DE PERFORMANCE ({historicDelta.previousDate})</h4>
                      {historicDelta.changedProfile ? (
                        <p className="text-sm md:text-base text-foreground/90 font-medium border-l-2 border-primary pl-3">
                          Houve alteração no motor base. Seu perfil primário migrou de <span className="text-white font-bold">{historicDelta.changedProfile.from}</span> para <span className="text-primary font-bold">{historicDelta.changedProfile.to}</span>.
                        </p>
                      ) : (
                        <p className="text-sm md:text-base text-foreground/90 font-medium border-l-2 border-white/20 pl-3">
                          O eixo principal cravado. Não houve mudança no seu Perfil Primário (<span className="text-white font-bold">{testResult.primaryProfile}</span>). 
                        </p>
                      )}
                      <p className="text-[13px] text-foreground/60 mt-3">
                        Variação pontual na tração: Dominância ({historicDelta.D > 0 ? '+' : ''}{historicDelta.D}%), Influência ({historicDelta.I > 0 ? '+' : ''}{historicDelta.I}%), Estabilidade ({historicDelta.S > 0 ? '+' : ''}{historicDelta.S}%), Conformidade ({historicDelta.C > 0 ? '+' : ''}{historicDelta.C}%).
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/10">
                     <div>
                       <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest mb-3">CONSTRUÇÃO (IRMÃOS)</h4>
                       <div className="flex flex-wrap gap-2">
                         {testResult.relationships.brothers.map((bro: string) => (
                           <span key={bro} className="bg-panel border border-border px-3 py-1.5 rounded text-sm text-foreground/80 uppercase">{bro}</span>
                         ))}
                       </div>
                       <p className="text-[11px] text-foreground/40 mt-3 max-w-[200px]">Perfis com zonas de tráfego fluidas. Engrenam fácil com o seu modelo mental.</p>
                     </div>
                     <div>
                       <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest mb-3">CONTRAPONTO (PRIMO)</h4>
                       <div className="flex flex-wrap gap-2">
                         <span className="bg-black border border-white/10 px-3 py-1.5 rounded text-sm text-white/90 uppercase">{testResult.relationships.cousin}</span>
                       </div>
                       <p className="text-[11px] text-foreground/40 mt-3 max-w-[200px]">Polo oposto. Pode gerar ruído, mas é o freio ou o nitro que falta na sua máquina.</p>
                     </div>
                  </div>
                </div>
             </div>
             </div>
           </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
