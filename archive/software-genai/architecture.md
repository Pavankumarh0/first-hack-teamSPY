# Campus Mithra — how it works

## The pipeline

```
spoken question
   │  (ESP32 mic → host)
   ▼
"What is the hostel fee for an AC double room?"
   │
   ├─ embed with all-MiniLM-L6-v2 ──────────────► 384-dim unit vector
   │
   ├─ cosine similarity against every chunk ────► 300-odd scores
   │
   ├─ keep TOP_K = 3 highest
   │
   ├─ guard 1, floor: best score < 0.18 ? ──────► refuse, no API call
   │
   ├─ guard 2, off-topic classifier:
   │     closer to a non-college exemplar ? ────► refuse, no API call
   │
   ├─ guard 3, prompt contract:
   │     rules + 3 passages + question
   │
   ├─ Gemma, temperature 0.2, max 512 tokens
   │
   ├─ output check: hedge or empty ? ───────────► refuse
   ▼
answer + sources + score  →  TFT lines + speech
```

## Module map

| Module | Responsibility |
|---|---|
| `config.py` | loads `.env` without any dependency, holds every tunable |
| `knowledge.py` | reads `.md`/`.txt`/`.pdf`, splits into heading-aware 120-word windows |
| `retriever.py` | embeds chunks, caches the matrix on disk, cosine top-k search |
| `scope.py` | guard 2 — the off-topic exemplar classifier |
| `generator.py` | the prompt contract and the Google GenAI call, with useful errors |
| `pipeline.py` | wires it together, applies all three guards, returns `Answer` |

## Chunking

Each document is first split at Markdown headings, then each section is cut into
120-word windows that overlap by 30 words (step = 90). Every chunk is prefixed with
`document title - nearest heading`, which is what makes a bare table row such as

```
| AC double sharing | 2 students | Rs. 78,000 | Rs. 48,000 | Rs. 1,26,000 |
```

retrievable by the question "what is the hostel fee for an AC room" — the row itself
never contains the word *hostel*, but its prefix does.

The embedding cache is keyed by a SHA-256 of the embedding model name, the chunk
parameters and every chunk's text, so editing any knowledge base file or changing
`CHUNK_SIZE` automatically re-indexes on the next run.

## Why cosine similarity and no vector database

300-odd chunks of 384 floats is a 0.5 MB matrix. Retrieval is one matrix-vector
multiply — well under a millisecond — so a vector database would add a dependency, a
service to run and a failure mode for no gain. MiniLM embeddings are L2-normalised,
so the cosine score is just the dot product; `Retriever.cosine_similarity` still
divides by the norms so it stays correct if a different, non-normalised embedding
model is configured.

## Why a single threshold does not work

The first design used one number: refuse anything whose best chunk scored below
`MIN_SIMILARITY`. Measuring it on 61 questions killed that idea. Sorted by score,
in-scope and out-of-scope questions interleave:

```
0.112  OFF  tell me a joke
0.173  IN   Barber shop?
0.222  OFF  what is 2 plus 2
0.234  IN   Is there an ATM?
0.289  IN   Wifi?
0.289  OFF  how do I apply for a passport
0.316  IN   Who is the principal?
0.332  OFF  nearest movie theatre
0.342  OFF  recipe for dosa
0.494  OFF  fees at VIT Vellore
0.545  OFF  best engineering college in India
0.559  IN   EV charging?
```

Short genuine questions score low because a 3-word question has little to match
against a 120-word passage; unrelated questions about *fees at another college* score
high because the words overlap with the fee tables. The best achievable single
threshold still refused 2 of 37 real questions while letting 7 of 24 unrelated ones
through.

## Guard 2: the off-topic classifier

So the question is also scored against 22 exemplar sentences describing what the
assistant is not for (`scope.py`). A question is out of scope when

```
max_similarity(question, off_topic_exemplars)
  - max_similarity(question, knowledge_base) > OFF_TOPIC_MARGIN
```

This is a two-class nearest-neighbour classifier over the same MiniLM embeddings, so
it adds one 22×384 matrix and no API call. It turns the weather question — which
scores 0.323 against the transport document, comfortably over any usable floor — into
a refusal, because it scores 0.568 against the weather exemplar.

With the floor dropped to 0.18 and this guard added, the same 61 questions give **1
real question refused instead of 2, and 5 unrelated reaching the model instead of 7**
— and the one real question that was refused ("Barber shop?") is the lowest-scoring
question in the whole set.

Writing exemplars has one trap worth knowing. The original politics exemplar read
*"who is the prime minister or the president of a country"*, and it wrongly captured
*"who is the principal of the college"* — MiniLM matched the shape
`who is the <role> of <organisation>` rather than the subject. Naming the subjects
instead (*"who is the prime minister of India, who is the president of the United
States"*) fixed it. Phrase exemplars around their nouns, not their grammar.

## Tuning

```powershell
python cli.py --scope "what is the fee at IIT Bombay"   # both guard scores
python cli.py --guards                                  # whole test set, offline
python cli.py --test                                    # end to end, uses the API
```

`--guards` is the one to watch. Its first number must stay at zero:

```
in-scope questions blocked before Gemma : 0/15   (must be 0)
off-topic questions blocked before Gemma: 7/12
```

- A real question refused → lower `MIN_SIMILARITY`, or raise `OFF_TOPIC_MARGIN`, or
  reword the exemplar that `--scope` names as the closest match.
- Off-topic questions reaching Gemma → acceptable. They cost an API call and guard 3
  refuses them. Only tighten if the model starts answering them.

Refusing a real visitor is the worse failure, so `OFF_TOPIC_MARGIN` defaults to
`+0.03`, which sends near-ties to Gemma rather than refusing them.

## Why three guards and not one

Each guard fails differently:

- The **floor** cannot judge topic, only whether anything matched.
- The **classifier** cannot know what is *inside* a passage. "What is the salary of
  the principal?" is a perfectly well-formed college question, and the staff document
  scores 0.295 on it — but the figure is not in the knowledge base.
- The **prompt contract** is the only guard that reads the retrieved text, but it is
  a model following instructions, so it is the one that can be argued out of its job.

Together, an answer has to be retrievable, on topic, and literally present in the
retrieved text.

## Replacing the college

1. Delete the 12 files in `software/knowledge_base/` and drop in the real documents
   (Markdown is best; plain text and PDF also work).
2. Set `COLLEGE_NAME` in `.env`.
3. Delete `software/.cache/` so the embeddings are rebuilt.
4. Run `python scripts/check_setup.py`, then `python cli.py --guards` and tune until
   no in-scope question is blocked.
5. Edit `TEST_QUESTIONS` in `cli.py` to questions about the real college — the test
   set is only as useful as the questions in it.

Keep documents topic-per-file with real Markdown headings. The heading is half the
retrieval signal.

## Host and device split

The ESP32 has about 300 KB of usable RAM. MiniLM alone is 90 MB, so embeddings and
generation have to live on the host. The device does what it is good at: capture
audio, show text, drive the amplifier. The host returns the answer already wrapped to
26 characters per line and capped at 14 lines, so the firmware prints rows and does
no text layout of its own.
