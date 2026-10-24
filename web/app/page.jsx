'use client';

import { useEffect } from 'react';
import Hero3D from '../components/Hero3D';
import Logo, { Wordmark } from '../components/Logo';
import './landing.css';

const EXCHANGES = [
  {
    q: 'Is there a bus from Electronic City, and what does it cost?',
    a: 'Yes. Route R-03 starts at Electronic City and runs through Bommanahalli, BTM Layout and Jaraganahalli. It leaves at 6:40 AM and reaches the campus at 8:25 AM. The fee depends on the distance slab.',
    ok: true,
  },
  {
    q: 'What is the hostel fee for an AC double sharing room?',
    a: 'An AC double sharing room is Rs. 78,000 a year for the room plus Rs. 48,000 for the mess, so Rs. 1,26,000 in all. A refundable caution deposit of Rs. 8,000 is collected when you join.',
    ok: true,
  },
  {
    q: 'Who won the cricket final last night?',
    a: 'I can only answer questions about the college, using the information I have.',
    ok: false,
  },
];

const STEPS = [
  { n: '01', h: 'Listen', p: 'A visitor holds the TALK button and speaks. The ESP32 records and sends the audio.' },
  { n: '02', h: 'Understand', p: 'Whisper turns the speech into text on the server, tuned with the college’s own vocabulary.' },
  { n: '03', h: 'Retrieve', p: 'The most relevant sections of the college knowledge base are found by embeddings and keywords.' },
  { n: '04', h: 'Answer', p: 'Gemma writes a short answer from those sections only, then it is spoken and shown on screen.' },
];

const TOPICS = [
  { icon: '\u{1F393}', h: 'Admissions', p: 'Quotas, intake per branch, eligibility, documents, dates.' },
  { icon: '\u{1F4B0}', h: 'Fees & scholarships', p: 'The full fee table by route, instalments, concessions, refunds.' },
  { icon: '\u{1F4BC}', h: 'Placements', p: 'Branch-wise percentages, recruiters, packages, internships.' },
  { icon: '\u{1F3E0}', h: 'Hostel & mess', p: 'Room types with charges, meal timings, rules, wardens.' },
  { icon: '\u{1F68C}', h: 'Transport', p: '28 routes with stops and timings, distance slabs, metro shuttle.' },
  { icon: '\u{1F4DA}', h: 'Campus & staff', p: 'Labs, library, sports, parking, canteen rates, department heads.' },
];

const KIT = [
  ['ESP32 DevKit', 'Wi-Fi, microphone ADC, speaker DAC'],
  ['2.8" SPI TFT', 'ILI9341, 320 × 240, shows the answer'],
  ['Earphone mic', 'Through a 3.5 mm socket'],
  ['PAM8403 + speaker', '5 V class-D amplifier'],
  ['Push-to-talk button', 'Hold to speak, release to send'],
  ['Server PC', 'Whisper, RAG and Gemma'],
];

export default function Home() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }),
      { threshold: 0.15 }
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header className="site-head">
        <div className="wrap site-head-inner">
          <a href="/" aria-label="Campus Mithra home">
            <Wordmark />
          </a>
          <nav className="site-nav">
            <a href="#answers">Ask anything</a>
            <a href="#how">How it works</a>
            <a href="#kiosk">The kiosk</a>
            <a className="nav-cta" href="/kiosk/">Try it</a>
          </nav>
        </div>
      </header>

      <Hero3D />

      <main>
        <section className="section" id="answers">
          <div className="wrap answers-grid">
            <div>
              <p className="eyebrow reveal">The problem</p>
              <h2 className="reveal">
                Every question a parent
                <br />
                walks in with.
              </h2>
              <p className="lead reveal" style={{ marginTop: 16 }}>
                Hostel rooms, bus stops, the highest package, where to park the car. Today they
                ask whichever student happens to be standing near the gate. Mithra answers from
                the college&rsquo;s own information &mdash; out loud, on a screen, at the gate.
              </p>
            </div>

            <div className="thread reveal">
              {EXCHANGES.map((x, i) => (
                <div key={i}>
                  <p className="bubble-q">{x.q}</p>
                  <p className={`bubble-a${x.ok ? '' : ' refused'}`}>{x.a}</p>
                </div>
              ))}
              <p className="thread-note">
                The last one is the point: anything outside the knowledge base is refused, not
                guessed.
              </p>
            </div>
          </div>
        </section>

        <section className="section band" id="how">
          <div className="wrap">
            <p className="eyebrow reveal">How it works</p>
            <h2 className="reveal">Grounded, not guessed.</h2>
            <p className="lead reveal" style={{ marginTop: 16 }}>
              Mithra never improvises. If the answer is not in the college&rsquo;s knowledge
              base, it says so and points to the admission office instead.
            </p>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s.n} className="step reveal">
                  <span className="step-n">{s.n}</span>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <p className="eyebrow reveal">The knowledge base</p>
            <h2 className="reveal">
              One college, written
              <br />
              down properly.
            </h2>
            <div className="topics">
              {TOPICS.map((t) => (
                <article key={t.h} className="card topic reveal">
                  <span className="topic-icon" aria-hidden="true">{t.icon}</span>
                  <h3>{t.h}</h3>
                  <p>{t.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section band" id="kiosk">
          <div className="wrap kiosk-grid">
            <div>
              <p className="eyebrow reveal">The kiosk</p>
              <h2 className="reveal">A small box at the front desk.</h2>
              <p className="lead reveal" style={{ marginTop: 16 }}>
                The ESP32 does what it is good at &mdash; listen, show, speak. The thinking
                happens on a laptop on the same Wi-Fi, so the device stays cheap and the model
                stays current.
              </p>
              <div className="reveal" style={{ marginTop: 26 }}>
                <a className="btn btn-primary" href="/kiosk/">Open the web kiosk</a>
              </div>
            </div>
            <ul className="kit reveal">
              {KIT.map(([name, note]) => (
                <li key={name}>
                  <b>{name}</b>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <Logo size={38} id="foot" />
          <p>
            Campus Mithra &middot; built for Campus AI &middot; Gemma, RAG and an ESP32
          </p>
          <p className="fine">
            The college in this demo is fictional and every figure in it is sample data.
          </p>
        </div>
      </footer>
    </>
  );
}
