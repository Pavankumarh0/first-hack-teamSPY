# Campus Mithra: pitch and demo script

About 8 minutes of talking plus about 4 minutes of live demo. Lines in plain text are spoken.

- **[SHOW: ...]** what is on the projector (slide, website, app or dashboard).
- **[DO: ...]** what you do with your hands.
- **[LIVE DEMO]** marks the hardware demo moments.

Timings are a guide; the demo can run longer if the judges are interested.

---

## Before you go on stage (10 minutes earlier)

1. Run `.\start.ps1` in a **new** terminal. Wait for "Server up" and for the kiosk screen to show "ready".
2. Keep the phone charged, on mobile data, with the Campus Mithra app installed and signed in. Notifications and location should be **allowed**.
3. Open these four browser tabs on the laptop, in this order:
   1. Website home: https://first-hack-team-spy-sigma.vercel.app
   2. Website campus map: `/map`
   3. Admin dashboard, signed in as admin: `/admin/announcements`
   4. Admin map editor: `/admin/map`
4. Do a warm-up question once: press the button and ask "Where is the library?". The first answer of the day is the slowest.
5. Draft one notice in the dashboard (title: "Welcome to Admissions Day!") but **do not publish it yet**. You will publish it live.
6. Keep the kiosk where the judges can see the screen, with the speaker facing them.
7. Backup: if the venue Wi-Fi is bad, connect the laptop and the phone to your phone's hotspot.

---

## 1. The problem (about 1 minute)

**[SHOW: a slide with a photo of a crowded college gate on admission day, or just the title "Admissions Day"]**

Think about the day a student comes to a college for admissions.

They come with their parents. It is their first time on this campus, and it is big. They need to find the admission office. Then the accounts section to pay fees. Then the hostel, maybe the library, maybe a department to meet a professor.

And they have so many questions. How are the placements here? What is the fee for Computer Science? Is there a hostel, and how much does it cost? Is there a college bus to my area?

So what do they do? They stop a senior student on the road and ask. Or they ask the security guard. Or they walk around for twenty minutes looking for the right building.

**[SHOW: a slide with three points: "Lost on campus", "Same questions, every year", "Answers depend on who you ask"]**

The problem is not that the information does not exist. The college has it all: fee structures, placement records, building plans. The problem is that it is not available **at the moment, at the place, and in the language** the visitor needs it.

And remember, many parents are more comfortable in Kannada or Hindi than in English. Many students speak a mix, Kanglish or Hinglish. A notice board in English does not help them.

---

## 2. Our solution: Campus Mithra (about 30 seconds)

**[SHOW: the website home page, https://first-hack-team-spy-sigma.vercel.app]**

So we built **Campus Mithra**. Mithra means friend.

Campus Mithra is a campus guide that works in three places, and they all share the same live campus data:

1. **A voice kiosk at the Main Gate.** You press a button and ask your question out loud, in English, Kannada or Hindi.
2. **A student app and a website.** Campus map with live walking directions, events, clubs, notices, and more.
3. **An admin dashboard** for the college, to keep all of it up to date. No coding needed.

Let me show you the journey of a visitor, starting from the gate.

---

## 3. The journey, part 1: at the Main Gate kiosk (about 2 minutes)

**[SHOW: point to the physical kiosk on the table]**

This is the Campus Mithra kiosk. Imagine it at the Main Gate.

### LIVE DEMO 1: an English question

**[LIVE DEMO] [DO: hold the button, ask "Where is the placement cell?", release the button]**

While it thinks, notice the screen: Mithra's face goes into thinking mode, and our question is already shown on the screen.

**[DO: wait for the spoken answer, then point to the screen]**

It answered out loud, with the building, floor and room, and how far it is from the gate. It also tells you **where the answer came from**. Mithra never makes things up. If the answer is not in the college's records, it simply says "I don't know about that." It does not guess.

### LIVE DEMO 2: Kanglish, and a map you can take with you

Now let me ask the way most students here actually talk.

**[LIVE DEMO] [DO: hold the button, ask "Boys hostel-ge hoguva map kodi", release]**

I asked in Kanglish, half Kannada and half English. And Mithra replied in Kanglish too, in the same style I asked.

**[DO: point to the QR code on the kiosk screen]**

And look: a QR code appeared on the screen. The kiosk cannot walk with you, but your phone can.

### LIVE DEMO 3: scan and walk

**[LIVE DEMO] [DO: scan the QR code with the phone camera, then hold the phone up to the judges, or mirror it on the projector]**

I scan it, and the route opens on my phone. It asks for my location once, and then it guides me **live**, step by step, along the real campus paths to the Boys Hostel. My location stays on my phone; it is never uploaded.

### LIVE DEMO 4: Hindi (only if time allows)

**[LIVE DEMO] [DO: hold the button, ask "पुस्तकालय कहाँ है?" (Pustakalaya kahan hai?), release]**

A parent who speaks only Hindi asks in Hindi, and gets the answer in proper Hindi, spoken in a Hindi voice.

### How the multiple languages work

**[SHOW: a slide with the flow: "Voice → Sarvam speech-to-text → English → Campus data + Gemma → Sarvam translation → Kannada / Hindi voice"]**

The languages are powered by **Sarvam AI**, which is built for Indian languages.

1. Sarvam's speech recognition listens and **detects the language by itself**: Kannada, Hindi or English, even when they are mixed.
2. We translate the question to English and answer it from the college's records.
3. Then Sarvam translates the answer back. If you asked in Kanglish or Hinglish, you get a Kanglish or Hinglish answer. If you asked in pure Kannada or Hindi, you get pure Kannada or Hindi.
4. The answer is spoken in a Kannada, Hindi or English voice. The screen shows it in English letters, so everyone can read it.

---

## 4. The journey, part 2: on the phone (about 1.5 minutes)

**[SHOW: the website home, then scroll to "Install Android app" and open /app]**

The kiosk gets you started. After that, Campus Mithra lives on your phone.

The student app is on our website. Tap "Install Android app", and you get the app with live directions, the QR scanner, and notifications.

**[SHOW: the phone, the app home screen. Mirror the phone, or hold it up]**

In the app:

- **Campus map and live directions** to any building, room or office.
- **QR codes on buildings.** Scan the code on any door or notice board, and it opens that place, event or notice.
- **Events and clubs.** See what is happening this week.
- **Official notices**, straight from the college office.
- **Report an issue.** A broken fan, a leaking tap, no Wi-Fi: report it with a photo, and track it until it is fixed.
- **Student community.** Ask seniors your questions, the ones you would otherwise ask on the road.
- **Find Your People.** Find students with the same interests, for clubs and hackathon teams.
- **Campus IQ**, a daily quiz about your campus. New students learn the campus while playing.

### LIVE DEMO 5: a push notification, live

Now the college office wants to tell every student something. Watch the phone.

**[SHOW: switch to the admin dashboard tab, Announcements]**
**[LIVE DEMO] [DO: open the drafted notice "Welcome to Admissions Day!" and click Publish]**

**[DO: hold up the phone and show the notification arriving]**

One click in the dashboard, and the notification reaches every phone with the app. Tap it, and it opens the notice.

---

## 5. The journey, part 3: for the college, the admin dashboard (about 1 minute)

**[SHOW: the admin map editor, /admin/map]**

All of this runs on data the college controls. The admin dashboard needs no coding.

- **Campus map editor.** The admin draws the paths on top of the satellite view and marks each building's entrance. Directions everywhere use these paths. A built-in **map check** warns the admin when a building is not connected, so directions never break.

**[DO: point to the green "Every building is reachable" badge]**

- **Buildings, rooms and offices**, with floors and opening hours.
- **Events, clubs and notices.** Publishing sends the push notification you just saw.
- **QR codes.** Generate and print a QR code for every building, room and route.
- **The knowledge base.** Fees, placements, hostel, admissions. This is what the kiosk answers from.
- **Kiosk management.** Each kiosk has its own secure device key, and the admin can revoke it at any time.
- **Maintenance reports and community moderation.**

---

## 6. Tech stack (about 1 minute)

**[SHOW: a tech stack slide with four columns: Kiosk hardware | AI and languages | Web and app | Cloud]**

Here is how it is built.

**Kiosk hardware**
- **ESP32** microcontroller, programmed in C++ with PlatformIO
- **2.8-inch ILI9341 TFT display** for the face, the answers and the QR codes
- **INMP441** I2S digital microphone
- **MAX98357A** I2S amplifier with a speaker
- A push-to-talk button
- Connected by USB to a PC, which runs the brain

**AI and languages**
- **Sarvam AI**: speech-to-text with automatic language detection (saaras), and translation for Kannada, Hindi, Kanglish and Hinglish
- **Gemma 4**, Google's open model, which writes the answer
- **RAG** (retrieval-augmented generation): we first find the right part of the college's documents, and Gemma answers only from that
- **A grounding check**: every sentence and every number in the answer must come from the college's data, or the answer is rejected
- **Text-to-speech** in Indian English, Kannada and Hindi voices
- **Python FastAPI** server

**Web and app**
- Website and admin dashboard: **Next.js** with TypeScript and Tailwind CSS
- Student app: **Flutter**, Android
- Campus map: our own path network with **shortest-path routing** (Dijkstra), on top of **Google Maps** satellite view

**Cloud**
- **Firebase**: login, Firestore database, file storage, and **Firebase Cloud Messaging** for push notifications
- Website hosted on **Vercel**

**Security**
- Each kiosk has its own revocable device key.
- Campus data sent to the AI is signed, so it cannot be faked.
- Database security rules decide who can read and change what.

---

## 7. Real-life implementation (about 1 minute)

**[SHOW: a slide with a 4-step timeline: Week 1 Map → Week 2 Content → Week 3 Kiosks and QR → Admissions day]**

How does a college start using Campus Mithra?

- **Week 1: map the campus.** The admin places the campus on the satellite map, draws the walking paths, and adds buildings, rooms and offices.
- **Week 2: add the content.** Upload the fee structure, the placement report, hostel and transport details. Add events, clubs and notices.
- **Week 3: install.** Put a kiosk at the Main Gate and one at the admission office. Print QR codes for every building door and notice board. Put the app's download QR at the entrance.
- **Admissions day.** Visitors ask the kiosk, scan, and walk. The office keeps notices current from the dashboard.

After that it mostly runs itself. When a fee changes or an event is added, the admin updates it once, and the kiosk, website and app all change together.

---

## 8. Business model (about 1 minute)

**[SHOW: a business model slide]**

Our customers are **colleges and universities**. Every college has admissions every year, and every college wants to impress parents on that first visit.

Proposed pricing:

| What | Price (proposed) |
|---|---|
| **Software subscription**: website, app, admin dashboard and kiosk software, per campus | ₹50,000 to ₹1,50,000 per year, by campus size |
| **Kiosk hardware kit**: ESP32, display, mic, speaker, enclosure | One-time; sold or rented for admission season |
| **Setup service**: we map the campus and load the content | One-time fee |
| **Admissions insights** (add-on): what visitors asked most, in which language, which buildings they looked for | Premium add-on |

The hardware is very cheap. The kiosk electronics cost roughly two to three thousand rupees, so **one kiosk costs less than one temporary helpdesk staff member for the admission season**, and it works every day, in three languages.

The same platform works anywhere people get lost and ask the same questions: **hospitals, government offices, malls, exhibitions and events**. That is where we grow next.

---

## 9. Closing (about 30 seconds)

**[SHOW: the kiosk, with Mithra's face on the screen. Or the title slide again]**

So, back to that student and their parents at the gate.

With Campus Mithra, they do not have to stop strangers. They do not have to walk around for twenty minutes. They press a button, ask in their own language, get a true answer from the college itself, and walk straight to where they need to go, with the map on their phone.

Campus Mithra. **Your friend on campus, in your language.**

Thank you.

**[DO: if there is time, invite a judge to press the button and ask the kiosk anything in their own language]**

---

## If a demo fails, say this and move on

| What went wrong | What to say and do |
|---|---|
| The kiosk did not hear | "It's noisy here, let me try again closer to the mic." Ask once more, slower. |
| The answer is slow | "It's thinking. It checks the college records before answering." Wait about 15 seconds. |
| "I don't know about that." | "And that is a feature: if it is not in the college records, Mithra does not guess." Then ask a question you rehearsed. |
| No internet | Show the website and the app screens on the laptop, and explain the flow with the slide. |
| The push notification is late | "Notifications can take a few seconds," and continue. Show it when it arrives. |

## Questions the judges may ask

- **What if the AI gives a wrong answer?** It answers only from the college's own documents. A grounding check rejects any sentence or number that is not in those documents. If it is not sure, it says "I don't know about that."
- **Why does the kiosk need a PC?** The ESP32 handles the mic, speaker, screen and button. The PC runs the AI pipeline. In production, one small mini-PC can run several kiosks, or the server can run in the cloud.
- **What about privacy?** No camera, no face recognition. Location for live directions stays on the phone. Voice is used only to answer the question.
- **Why Sarvam?** It is built for Indian languages and code-mixed speech like Kanglish and Hinglish, and it detects the language automatically.
- **Can the college update it without us?** Yes. Everything is in the admin dashboard: map, buildings, notices, events, QR codes, knowledge base.
- **Does it work for iPhone users?** The full website works on any phone, including the live directions. The app is Android first.
