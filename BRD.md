# Business Requirements Document: Recess

| | |
|---|---|
| **Working title** | Recess (final name open, see section 14) |
| **Version** | 0.1 Draft |
| **Status** | For review |
| **Author** | [name] |
| **Companion document** | PRD.md (functional and technical requirements) |

Conventions: numbers marked *proposed* are targets to validate. Items marked **[TO VERIFY]** need real data before being relied on. No market statistics are stated in this document.

---

## 1. Executive summary

Recess is a browser-based tool for desk workers who sit for hours without a break. The user starts a work session. When each focus interval ends, the app covers the screen with a break overlay and requires camera-verified exercises (MediaPipe pose tracking) before work can continue. A short rest activity (eye rest, breathing, water) then fills the remaining break time. All video is processed locally in the browser. There is no backend in v1.

## 2. Problem statement

**Who is affected:** corporate and remote knowledge workers, especially software engineers, consultants and analysts, who work in long uninterrupted blocks.

**Problem:** long, unbroken sitting and screen time are common in these roles, and break reminders are routinely dismissed. Existing reminder tools (for example Stretchly, Workrave) show a prompt that the user can ignore with one click, so the break never happens.

**Opportunity:** a break that requires a verifiable physical action is harder to dismiss than a notification, and an on-device camera check makes that possible without sending video anywhere.

**[TO VERIFY]** Evidence on sedentary work and break effectiveness should be sourced from reputable references before it is used in any external material.

## 3. Business objectives and success metrics

| ID | Objective | Metric | Proposed target (to validate) |
|---|---|---|---|
| OBJ-1 | Make breaks actually happen | Break completion rate (breaks started that finish all exercises) | 80% or higher |
| OBJ-2 | Keep enforcement fair, not hostile | Snooze + postpone rate per break | 25% or lower |
| OBJ-3 | Build a daily habit | Average completed breaks per active user per workday | 6 or more |
| OBJ-4 | Retain users | 7-day and 30-day retention of users who start a session | 40% / 20% |
| OBJ-5 | Low friction to start | Share of visitors who start a session after viewing the start screen | 30% or higher |
| OBJ-6 | Trust | Camera permission grant rate at first break | 70% or higher |

Metrics require measurement. v1 has no backend, so measurement is local-only (session summary) unless an opt-in, privacy-preserving analytics decision is made (see open question Q-5).

## 4. Scope

**In scope (v1)**
- Web app running in the browser, fully client-side
- Configurable work time, focus time and break time, with presets
- Camera-verified exercise breaks using a 12-exercise library
- Rest activities: eye focus (20-20-20), eyes-closed rest, breathing, water reminder
- Snooze and "I'm in a meeting" postpone, both limited and reported
- Office mode (seated-safe exercises) and Quiet mode (no jumping)
- Session summary; settings persisted locally; refresh-safe session state

**Out of scope (v1)**
- Desktop wrapper or browser extension (stronger enforcement)
- User accounts, cloud sync, team features, leaderboards
- Mobile app
- Any medical, therapeutic or health-outcome claims

**Future phases**
- Daily streaks and weekly summary
- Team or organisation features
- Desktop app (Tauri or Electron) for stronger enforcement
- Additional exercises and rest activities

## 5. Stakeholders and personas

| Persona | Goals | Pain points | Constraints |
|---|---|---|---|
| **Open-office individual contributor** | Take breaks without drawing attention | Squats and jumping are awkward in view of colleagues | Needs quiet, seated-safe options |
| **Remote developer** | Protect long focus blocks while still moving | Forgets to take breaks; ignores reminders | Wants timing control, minimal friction |
| **Team lead** | Healthier habits for self and team | Team burns out through unbroken work | Needs trust and privacy assurances before recommending |
| **Product owner / sponsor** | Validate the idea cheaply | Unknown willingness to use camera | Small budget, no backend |

## 6. Assumptions, constraints, dependencies

- Users have a working front-facing webcam and grant camera permission.
- Camera access requires HTTPS (or localhost).
- Target browsers: current Chromium-based browsers, Safari, Firefox (WebGL/WASM required).
- Pose and face models are served with the app (self-hosted) to avoid third-party calls at runtime. **[TO VERIFY]** model licensing and hosting terms.
- Notification permission may be denied; the app must work without it.
- Corporate IT policy may block camera access or notifications on managed laptops.
- Browsers throttle timers in background tabs; timing must be timestamp-based.

## 7. Business requirements

| ID | Requirement | Priority | Rationale |
|---|---|---|---|
| BR-01 | Users can run timed work sessions with configurable work, focus and break durations | Must | Core value; different jobs need different rhythms |
| BR-02 | A break must require a verifiable physical action before work resumes | Must | Differentiator from dismissible reminders |
| BR-03 | Video must be processed on-device only, never stored or transmitted | Must | Trust and adoption on work laptops |
| BR-04 | Users must be able to choose exercises suitable for their environment | Must | Open-office adoption depends on it |
| BR-05 | Breaks must include non-exercise rest (eyes, breathing, water) | Should | Full break value, lower effort than exercise |
| BR-06 | Enforcement must be firm but not hostile (limited snooze/postpone, reported honestly) | Must | Avoids abandonment |
| BR-07 | The product must be honest about limits (cannot truly lock a computer; not medical advice) | Must | Credibility and liability |
| BR-08 | The interface must feel calm and professional, not gimmicky | Should | Corporate users will not adopt a toy-like tool |
| BR-09 | The product must run with no backend and no account | Must | Minimal cost, instant start |
| BR-10 | The product must be accessible, including alternatives when an exercise cannot be performed | Should | Inclusion and risk reduction |

## 8. Risks and mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Users circumvent the overlay (close tab, ignore) | High | High | Be honest about limits; limited snooze; consider desktop wrapper in a later phase |
| R-02 | Camera blocked by IT policy or user distrust | Medium | High | Prominent local-processing statement; explain before requesting; fallback decision at Q-4 |
| R-03 | Rep detection inaccurate (lighting, angle, clothing) | Medium | Medium | Visibility checks, hysteresis, tunable thresholds, "step back" guidance |
| R-04 | Workplace embarrassment | Medium | High | Office mode, Quiet mode, seated-safe exercises |
| R-05 | Injury or liability from exercises | Low | High | Visible disclaimer: not medical advice, stop if you feel pain; gentle exercises; skip option |
| R-06 | Notification fatigue | Medium | Medium | Sensible defaults (30 min focus), optional pre-break warning |
| R-07 | Timer drift in background tabs | High | Medium | Timestamp-based timing, persisted session state |
| R-08 | Users forced to exercise during meetings | Medium | Medium | Limited, reported "I'm in a meeting" postpone |

## 9. Compliance and privacy

- Camera is requested only when a break begins, with a clear explanation.
- Video frames stay in memory, are never recorded, stored or sent, and the camera stream is released immediately when the exercise phase ends.
- No personal data is collected in v1. Settings and session stats are stored in the browser's local storage only.
- Corporate deployment may require IT and security review. **[TO VERIFY]** any regional requirements before external launch.
- Product copy must contain no health-outcome claims.

## 10. Release plan

| Milestone | Contents |
|---|---|
| **MVP** | Timing model and presets, session flow, squat + 3 upper-body exercises, shared rep counter, overlay, snooze, summary, debug mode |
| **v1** | All 12 exercises, Office/Quiet modes, rest activities, postpone, exercise illustrations, dark variant, accessibility pass |
| **v1.1** | Eyes-closed verification, optional extras (calf raises, leg extensions, neck rolls), polish from feedback |
| **Later** | Streaks, weekly summary, desktop wrapper, team features |

Dates intentionally omitted; any dates are *proposed* after estimation.

## 11. Traceability (objective to requirement)

| Objective | Business requirements | PRD functional areas |
|---|---|---|
| OBJ-1 | BR-01, BR-02, BR-04 | FR-3, FR-4, FR-5 |
| OBJ-2 | BR-06 | FR-7 |
| OBJ-3 | BR-01, BR-05 | FR-1, FR-2, FR-6 |
| OBJ-4 | BR-08, BR-10 | FR-8, NFR-A |
| OBJ-5 | BR-09 | FR-1 |
| OBJ-6 | BR-03, BR-07 | FR-4, NFR-P |

## 12. Known limitations (to state honestly in product and README)

- A web page cannot truly lock the computer; enforcement is a full-screen overlay plus the user's own commitment.
- Rep accuracy depends on lighting, camera angle and clothing. Torso twists and calf raises are the weakest from a front camera.
- Squats and jumping are awkward in open offices.
- Managed laptops may block the camera.

## 13. Glossary

- **Work time:** total session length.
- **Focus time:** work between breaks.
- **Break time:** total length of each break (exercise phase + rest phase).
- **Overlay:** full-screen blocking view shown during a break.
- **Hysteresis:** separate enter/exit thresholds to prevent double-counting.
- **Seated-safe:** can be done from a chair without standing.

## 14. Open questions

| ID | Question |
|---|---|
| Q-1 | Final product name (candidates: Recess, Breakpoint, Intermission) |
| Q-2 | Default focus/break values (proposed 30 / 3) |
| Q-3 | Is the desktop wrapper a v1 goal or a later phase? |
| Q-4 | What is offered for workplaces that block webcams (manual confirmation mode?) |
| Q-5 | Is any opt-in analytics acceptable, given the privacy promise? |
| Q-6 | Domain / trademark availability for the chosen name |

## 15. Sign-off

| Name | Role | Signature | Date |
|---|---|---|---|
| | | | |
| | | | |
