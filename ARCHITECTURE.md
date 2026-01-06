# System Architecture & Technical Specification: Proctored Interview Platform

## 1. High-Level System Architecture

The system follows a moduler, event-driven microservices-ready architecture (currently a robust monolith for speed/consistency, decomposable later).

### Core Components:
- **Client (Frontend)**: Next.js 14 (App Router) PWA. Handles UI, MediaPipe processing, device management.
- **API Gateway / Backend**: NestJS. Handles auth, orchestration, session management, signaling.
- **Realtime Engine**: Socket.io (Signaling & Events) + Redis (Pub/Sub for scaling).
- **Media Server (SFU)**: Managed WebRTC Provider (100ms/Daily/Agora) for scalable video.
- **AI Worker Node**: Python/Node.js worker for asynchronous heavy lifting (Post-processing video, generating reports).
- **Storage**: AWS S3 for recording artifacts and PDF reports.
- **Database**: PostgreSQL (Structured data), Redis (Hot state).

### Data Flow Loop:
1.  **Join**: Candidate gets secure link -> Validates Token -> Connects Socket -> Connects WebRTC.
2.  **Monitor**: Client-side MediaPipe runs inference -> Emits 'ViolationEvent' via Socket.
3.  **Process**: Server validates event -> Logs to Redis -> Pushes to Host via Socket.
4.  **Record**: SFU records composite stream -> Post-interview webhook triggers processing.
5.  **Report**: Worker pulls data -> Generates detailed metrics -> PDF generation -> S3 Upload.

---

## 2. Database Schema (PostgreSQL)

```sql
-- Core Users (Host only, candidates are ephemeral/linked via Invite)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  password_hash VARCHAR,
  org_id UUID,
  created_at TIMESTAMP
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY,
  host_id UUID REFERENCES users(id),
  title VARCHAR,
  status ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'ARCHIVED'),
  scheduled_at TIMESTAMP,
  config JSONB, -- { strictMode: true, allowCalculator: false }
  created_at TIMESTAMP
);

-- Candidates (Created upon invite or join)
CREATE TABLE candidates (
  id UUID PRIMARY KEY,
  interview_id UUID REFERENCES interviews(id),
  name VARCHAR,
  email VARCHAR,
  token VARCHAR UNIQUE, -- Magic link token
  resume_url VARCHAR
);

-- Sessions (Actual time spent in room)
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  candidate_id UUID,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  device_info JSONB
);

-- Violations (The core proctoring data)
CREATE TABLE violations (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  type ENUM('TAB_SWITCH', 'FACE_MISSING', 'MULTIPLE_FACES', 'AUDIO_DETECTED', 'FULLSCREEN_EXIT'),
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
  timestamp TIMESTAMP,
  snapshot_url VARCHAR, -- Optional screenshot evidence
  metadata JSONB -- { confidence: 0.98, duration: 2s }
);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  interview_id UUID,
  candidate_id UUID,
  score_composite INT, -- 0-100
  score_confidence INT,
  score_focus INT,
  report_pdf_url VARCHAR,
  ai_summary TEXT,
  generated_at TIMESTAMP
);
```

---

## 3. API Design

### POST /api/v1/interviews
Creates a new interview room.
**Body**: `{ title: "Senior React Dev", config: {...} }`
**Response**: `{ link: "https://app.io/i/xyz-abc", token: "jwt..." }`

### GET /api/v1/interviews/:id/monitor (WebSocket Namespace)
**Events (Client -> Server):**
- `join_room`: Handshake, auth.
- `telemetry_update`: Periodic heartbeat (focus status, connection quality).
- `violation`: `{ type: "TAB_SWITCH", timestamp: 12345 }`

**Events (Server -> Host Client):**
- `candidate_joined`: Status update.
- `live_alert`: `{ type: "TAB_SWITCH", severity: "HIGH", msg: "Candidate left tab" }`
- `stream_quality`: `{ jitter: 20ms, packetLoss: 0% }`

### GET /api/v1/reports/:interview_id
Returns aggregated stats and PDF download link.

---

## 4. WebRTC & Media Flow

**Choice**: **100ms (LiveKit alternative)** for robust SDKs.

### Architecture:
1.  **Token Generation**: NestJS generates a secure room token for the specific role (Host vs Candidate).
2.  **Connection**: Frontend connects to SFU.
    -   Candidate publishes: Camera (Video), Mic (Audio), Screen (optional).
    -   Host publishes: Camera, Mic.
    -   Host subscribes: Candidate Video (High Priority), Candidate Screen.
3.  **Recording**:
    -   Cloud recording enabled via composite layout (Host small, Candidate large).
    -   Audio track extraction for Speech-to-Text processing.

---

## 5. Frontend Folder Structure (Next.js 14)

```
apps/web/
├── app/
│   ├── (auth)/             # Login/Signup
│   │   └── login/
│   ├── (dashboard)/        # Host Dashboard
│   │   ├── dashboard/
│   │   └── interviews/
│   │       └── [id]/       # Interview Details & Report
│   ├── (room)/             # The Active Interview Room
│   │   └── i/
│   │       └── [token]/    # Candidate/Host Join Link
│   ├── api/                # Next.js API Routes (Proxy/Edge)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── proctoring/
│   │   ├── FaceMonitor.tsx         # MediaPipe wrapper
│   │   ├── TabLock.tsx             # Visibility API logic
│   │   └── DeviceCheck.tsx         # Pre-flight check
│   ├── room/
│   │   ├── VideoGrid.tsx
│   │   ├── Controls.tsx
│   │   └── HostSidebar.tsx         # Real-time alerts
│   ├── ui/                         # shadcn/ui components
│   └── reports/                    # PDF/Chart components
├── lib/
│   ├── proctor-engine/             # Core logic
│   │   ├── detector.ts             # Violation detection logic
│   │   ├── types.ts
│   │   └── confidence.ts           # Scoring algorithms
│   ├── webrtc/                     # 100ms/Agora hooks
│   └── store/                      # Zustand state (room state)
```

---

## 6. Backend Folder Structure (NestJS)

```
apps/api/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── interview/      # CRUD for interviews
│   │   ├── session/        # Active session state (Redis)
│   │   ├── monitor/        # WebSocket Gateway
│   │   │   ├── monitor.gateway.ts
│   │   │   └── monitor.service.ts
│   │   ├── reports/        # PDF generation & Analysis
│   │   └── webrtc/         # Provider integration
│   ├── common/
│   │   ├── guards/
│   │   └── decorators/
│   └── main.ts
```

---

## 7. Proctoring Logic (Client-Side + AI)

This is the "Brain" of the application. It runs silently on the candidate's browser using a Web Worker to prevent UI blocking.

### Stack:
- **@mediapipe/tasks-vision**: For extremely fast, lightweight face landmarks.
- **Page Visibility API**: For tab switching.
- **Window Focus/Blur events**: For app switching.

### Logic Flow (`/lib/proctor-engine/detector.ts`):
1.  **Clock**: Runs inference every 200ms.
2.  **Check 1 (Face)**:
    -   Is face present? No -> `FACE_MISSING` (Critical).
    -   Are there > 1 faces? Yes -> `MULTIPLE_FACES` (Critical).
    -   Pitch/Yaw/Roll threshold > 35deg? -> `LOOKING_AWAY` (Low/Medium).
3.  **Check 2 (System)**:
    -   `document.hidden` changed? -> `TAB_SWITCH` (High).
    -   `window.outerWidth` changed? -> `RESIZE_ATTEMPT` (Medium).
4.  **Debounce**: do not spam alerts. Aggregate similar alerts within 5s windows.
5.  **Emit**: Send compressed payload to Socket.

---

## 8. Real-time Alert System

Using **Server-Sent Events (SSE)** or **WebSockets (Socket.io)**. WebSockets preferred for bi-directional communication (Host can "ping" candidate).

-   **Candidate Side**: Emits JSON payloads.
-   **Server Side**:
    -   Validates timestamp (prevents replay attacks).
    -   Enriches with server-side confidence (if audio analysis is running).
    -   Persists to DB (async).
    -   Broadcasts to Host Room Channel.
-   **Host Side**:
    -   `useViolationStream()` hook subscribes to events.
    -   Toaster component displays "High Severity" alerts immediately.
    -   "Feed" component lists all alerts chronologically.

---

## 9. Recording Pipeline

1.  **Trigger**: Host clicks "Start Interview".
2.  **Provider**: Call WebRTC provider API `start_recording` with `layout: { type: "grid", priority: "candidate" }`.
3.  **Storage**: Provider uploads completed MP4 to intermediate bucket.
4.  **Webhook**: Provider hits `POST /api/webhooks/recording-complete`.
5.  **Processing**:
    -   Download MP4.
    -   Extract Audio.
    -   Run Transcription (AssemblyAI).
    -   Sync timestamps with Violation Log.

---

## 10. PDF Report Generation

-   Tech: **React-PDF** (render on server) or **Puppeteer** (headless capture).
-   **Content**:
    -   **Header**: Candidate Name, Date, ID.
    -   **Summary**: "High Confidence, Good Focus" (Generated by LLM based on violation density).
    -   **Score Cards**: Circular progress bars for metrics.
    -   **Timeline**: A visual Gantt chart showing "Speaking", "Tab Switch", "Looking Away".
    -   **Transcription Snippets**: Key questions asked/answered.

---

## 11. Security Implementation

1.  **Interview Tokens**: JWTs signed with short expiry, embedded in the join link.
2.  **Middleware**: `verifyInterviewToken` guard in NestJS.
3.  **Socket Auth**: Handshake must contain valid token.
4.  **DevTools Detection**:
    -   Loop `debugger` statement trick (rudimentary but effective against juniors).
    -   Screen dimension monitoring (docking devtools changes viewport).
5.  **Copy-Paste**: `onCopy`, `onCut`, `onPaste` intercepted and blocked (prevent default).
6.  **Right Click**: `contextmenu` event blocked.

---

## 12. Scalability Strategy

-   **Stateless Backend**: NestJS pods scale horizontally. state stored in Redis.
-   **Media Offload**: We do NOT process video streams on our servers. We use 100ms/Agora/LiveKit infrastructure.
-   **Database**: Read replicas for the Dashboard (lots of reads), Master for the Room logger (lots of writes).
-   **Queue**: Audio processing and PDF generation push to Redis BullMQ. Worker nodes process these jobs independently.

---

## 13. Production Deployment Plan

1.  **Infrastructure**: Vercel (Frontend), Railway/AWS ECS (Backend + Redis + Postgres).
2.  **CI/CD**: GitHub Actions.
    -   `test`: Unit tests.
    -   `build`: Next build + Nest build.
    -   `deploy`: Push to registry, update service.
3.  **Monitoring**:
    -   Sentry (Error tracking).
    -   PostHog (Product analytics).
    -   CloudWatch (Server logs).

---
