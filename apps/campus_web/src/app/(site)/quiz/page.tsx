'use client';
import { useEffect, useState } from 'react';
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useAuth, apiFetch } from '@/components/AuthProvider';
import { RequireMember } from '@/components/RequireMember';

type Question = { id: string; prompt: string; options: string[]; difficulty: string; version: string };
type Result = { correct: boolean; points: number; explanation: string; correctIndex: number; learnMoreUrl: string | null; allTime: number };
export default function QuizPage() { return <RequireMember why="Sign in to play Campus IQ and keep your score.">{() => <Quiz />}</RequireMember>; }
function Quiz() {
  const { idToken } = useAuth();
  const [question, setQuestion] = useState<Question | null>(null); const [period, setPeriod] = useState('allTime');
  const [leaders, setLeaders] = useState<{alias:string;points:number}[]>([]); const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function load() { try { const [{question:q},{leaders:l}] = await Promise.all([apiFetch<{question:Question|null}>(idToken,'/api/quiz/daily'), apiFetch<{leaders:{alias:string;points:number}[]}>(idToken,`/api/quiz/leaderboard?period=${period}`)]); setQuestion(q); setLeaders(l); } catch(e) { setError(String(e)); } }
  useEffect(() => { void load(); }, [period]);
  async function submit() { if (!question || choice == null) return; setBusy(true); setError(''); try { setResult(await apiFetch<Result>(idToken,'/api/quiz/answer',{method:'POST',body:JSON.stringify({questionId:question.id,version:question.version,optionIndex:choice})})); await load(); } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  return <div className="mx-auto max-w-4xl space-y-8"><PageHeader eyebrow="Learn your campus" title="Campus IQ" subtitle="A daily question based on administrator verified campus information." />
    {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-red-900">{error}</p>}
    {!question ? <EmptyState title="No published question yet" body="Check back after an administrator publishes a verified Campus IQ question." /> : <section className="card space-y-4 p-6"><p className="label-caps">{question.difficulty}</p><h2 className="text-2xl font-extrabold">{question.prompt}</h2>{question.options.map((o,i)=><button key={i} disabled={!!result} onClick={()=>setChoice(i)} className={`block w-full rounded-xl border-2 border-ink p-3 text-left ${choice===i?'bg-sun':''} ${result?.correctIndex===i?'bg-emerald-200':''}`}>{o}</button>)}
      {result ? <div className="rounded-xl bg-paper p-4"><b>{result.correct?'Correct!':`The correct answer was: ${question.options[result.correctIndex]}`}</b><p>{result.explanation}</p><p>+{result.points} points · total {result.allTime}</p>{result.learnMoreUrl && <a className="font-bold underline" href={result.learnMoreUrl}>Learn more</a>}</div> : <Button disabled={choice===null} busy={busy} onClick={()=>void submit()}>Submit answer</Button>}</section>}
    <section className="card p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">Leaderboard</h2><select className="input w-auto" value={period} onChange={e=>setPeriod(e.target.value)}><option value="allTime">All time</option><option value="weekly">This week</option></select></div>{leaders.length?leaders.map((x,i)=><p key={i} className="border-b py-2">{i+1}. {x.alias} <b className="float-right">{x.points}</b></p>):<p className="mt-3">No scores yet.</p>}</section>
  </div>;
}
