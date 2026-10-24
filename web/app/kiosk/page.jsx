'use client';

import { useEffect, useRef, useState } from 'react';
import Logo from '../../components/Logo';
import './kiosk.css';

const CHIPS = [
  'What are the hostel fees?',
  'Which bus route comes from Electronic City?',
  'What is the highest placement package?',
  'Where can parents park their car?',
  'How much does a masala dosa cost?',
  'How do I apply for admission?',
];

const SESSION = 'k' + Math.random().toString(36).slice(2, 8);
const MAX_RECORD_MS = 12000;

export default function Kiosk() {
  const [log, setLog] = useState([
    { role: 'a', text: 'Namaste! Ask me anything about the college.', ok: true },
  ]);
  const [status, setStatus] = useState('');
  const [value, setValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const endRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const stopTimerRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [log, status]);

  useEffect(() => () => {
    clearTimeout(stopTimerRef.current);
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, []);

  function show(result) {
    setLog((prev) => {
      const next = [...prev];
      if (result.question) next.push({ role: 'q', text: result.question });
      next.push({ role: 'a', text: result.answer, ok: result.in_scope });
      return next;
    });
    setStatus('');
    speak(result);
  }

  async function speak(result) {
    if (result.audio_id) {
      try {
        await new Audio(`/api/audio/${result.audio_id}.mp3`).play();
        return;
      } catch {
        /* autoplay blocked or TTS offline - fall through to the browser voice */
      }
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.answer));
    }
  }

  async function ask(question) {
    const q = (question || '').trim();
    if (!q || busy) return;
    setBusy(true);
    setStatus('Thinking…');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, session: SESSION }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      show(await res.json());
    } catch {
      setStatus('Cannot reach the server. Is it running on port 8000?');
    } finally {
      setBusy(false);
    }
  }

  async function sendAudio(blob, mimeType) {
    setStatus('Listening to what you said…');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, mimeType.includes('ogg') ? 'q.ogg' : 'q.webm');
      const res = await fetch(`/api/ask-audio?session=${SESSION}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      show(await res.json());
    } catch {
      setStatus('Cannot reach the server. Is it running on port 8000?');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (recRef.current?.state === 'recording') {
      recRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        clearTimeout(stopTimerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        sendAudio(new Blob(chunksRef.current, { type: rec.mimeType }), rec.mimeType);
      };

      rec.start();
      setRecording(true);
      setStatus('Recording… tap again to send');
      stopTimerRef.current = setTimeout(() => {
        if (recRef.current?.state === 'recording') recRef.current.stop();
      }, MAX_RECORD_MS);
    } catch {
      setStatus('Microphone blocked. Open this page over http://localhost:8000/kiosk or HTTPS.');
    }
  }

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <a href="/" className="kiosk-brand">
          <Logo size={36} id="kiosk" />
          <span>
            Campus <b>Mithra</b>
          </span>
        </a>
        <a href="/" className="kiosk-back">
          &larr; Back
        </a>
      </header>

      <div className="kiosk-log" role="log" aria-live="polite">
        {log.map((m, i) =>
          m.role === 'q' ? (
            <p key={i} className="k-q">{m.text}</p>
          ) : (
            <p key={i} className={`k-a${m.ok ? '' : ' refused'}`}>{m.text}</p>
          )
        )}
        <div ref={endRef} />
      </div>

      <p className="kiosk-status">{status}</p>

      <div className="kiosk-chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => ask(c)} disabled={busy}>
            {c}
          </button>
        ))}
      </div>

      <form
        className="kiosk-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value;
          setValue('');
          ask(v);
        }}
      >
        <button
          type="button"
          className={`kiosk-mic${recording ? ' rec' : ''}`}
          onClick={toggleMic}
          aria-label={recording ? 'Stop recording and send' : 'Record a question'}
        >
          <span aria-hidden="true">&#127908;</span>
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type a question, or tap the mic and speak"
          autoComplete="off"
          aria-label="Your question"
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Ask
        </button>
      </form>
    </div>
  );
}
