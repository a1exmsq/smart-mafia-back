# 🎭 Smart Mafia Voice Companion --- Backend

Microservice backend for the interactive **"Mafia"** game with an AI
narrator.\
Tech stack: **NestJS · PostgreSQL · Prisma · Socket.io · OpenAI ·
Docker**

------------------------------------------------------------------------

## 📐 Architecture

    ┌─────────────────────────────────────────────────────────────┐
    │                        React Client                         │
    │              REST (HTTP) + Socket.io (WebSocket)            │
    └──────────┬──────────────────────┬──────────────┬────────────┘
               │                      │              │
        ┌──────▼───────┐     ┌────────▼───────┐  ┌───▼───────────┐
        │ auth-service │     │  game-service  │  │  ai-service   │
        │   :3001      │     │  :3002 / :3012 │  │   :3003       │
        │              │     │                │  │               │
        │  JWT Auth    │     │ Rooms, Players │  │  OpenAI API   │
        │  Users CRUD  │     │ Game State     │  │  Narration    │
        │  bcrypt      │     │ Socket.io GW   │  │  Chat         │
        └──────┬───────┘     └───────┬────────┘  └───────────────┘
               │                     │
        ┌──────▼─────────────────────▼──────┐
        │         PostgreSQL :5432          │
        │  users · rooms · players          │
        │  game_states                      │
        └───────────────────────────────────┘

## 📁 Project Structure

    smart-mafia-backend/
    ├── docker-compose.yml
    ├── .github/workflows/ci-cd.yml
    ├── auth-service/                  # :3001 — JWT auth + users
    │   ├── prisma/schema.prisma
    │   └── src/
    │       ├── modules/auth/          # register, login, refresh
    │       └── modules/users/         # profile endpoint
    ├── game-service/                  # :3002 — game logic + :3012 WS
    │   ├── prisma/schema.prisma
    │   └── src/
    │       ├── modules/rooms/         # create, join, start
    │       ├── modules/players/       # join room, assign roles
    │       ├── modules/game-state/    # phase transitions, voting
    │       └── gateway/game.gateway.ts  # Socket.io
    └── ai-service/                    # :3003 — OpenAI narrator
        └── src/modules/ai/            # narrate, chat endpoints

------------------------------------------------------------------------

## 🚀 Quick Start

### 1. Local (Docker Compose)

``` bash
git clone <repo>
cd smart-mafia-backend

# Create .env files from examples
cp auth-service/.env.example auth-service/.env
cp game-service/.env.example game-service/.env
cp ai-service/.env.example ai-service/.env

# Add OPENAI_API_KEY to ai-service/.env

# Start everything
docker compose up -d

# Run migrations
docker compose exec auth-service npx prisma migrate deploy
docker compose exec game-service npx prisma migrate deploy
```

### 2. Local without Docker

``` bash
# PostgreSQL required on localhost:5432

cd auth-service && npm install && npx prisma migrate dev && npm run start:dev
cd game-service && npm install && npx prisma migrate dev && npm run start:dev
cd ai-service  && npm install && npm run start:dev
```

------------------------------------------------------------------------

## 📡 API Endpoints

### Auth Service `http://localhost:3001`

  Method   URL                Description
  -------- ------------------ ----------------------
  `POST`   `/auth/register`   Player registration
  `POST`   `/auth/login`      Login → JWT tokens
  `POST`   `/auth/refresh`    Refresh token
  `GET`    `/auth/health`     Health check
  `GET`    `/users/me`        Current user profile

### Game Service `http://localhost:3002`

  Method     URL                             Description
  ---------- ------------------------------- ------------------------
  `POST`     `/rooms`                        Create room
  `GET`      `/rooms`                        List active rooms
  `GET`      `/rooms/:code`                  Get room by code
  `PATCH`    `/rooms/:id/start`              Start game (host only)
  `POST`     `/players/join`                 Join room
  `DELETE`   `/players/leave/:roomId`        Leave room
  `GET`      `/players/room/:roomId`         Player list
  `POST`     `/game/:roomId/init`            Initialize game state
  `GET`      `/game/:roomId/state`           Current game state
  `POST`     `/game/:roomId/advance`         Next phase
  `POST`     `/game/:roomId/vote`            Vote
  `POST`     `/game/:roomId/resolve-votes`   Resolve voting results

### AI Service `http://localhost:3003`

  Method   URL             Description
  -------- --------------- ---------------------------------
  `POST`   `/ai/narrate`   Generate narration for an event
  `POST`   `/ai/chat`      Chat with the narrator
  `GET`    `/ai/health`    OpenAI health check

------------------------------------------------------------------------

## 🔌 Socket.io Events

**Namespace:** `/game`\
**Auth:** pass `token` in `socket.auth` or `Authorization` header

### Client → Server

  Event                    Payload                   Description
  ------------------------ ------------------------- -------------------
  `join_room`              `{ roomCode }`            Join room
  `leave_room`             ---                       Leave room
  `send_message`           `{ text }`                Chat message
  `player_ready`           ---                       Ready for game
  `cast_vote`              `{ voterId, targetId }`   Cast vote
  `request_ai_narration`   `{ prompt }`              Request narration

### Server → Client

  -------------------------------------------------------------------------------------------
  Event                 Payload                               Description
  --------------------- ------------------------------------- -------------------------------
  `room_joined`         `{ roomId, code, players, hostId }`   Join confirmation

  `player_joined`       `{ userId, username }`                New player

  `game_started`        `{ gameState }`                       Game started

  `your_role`           `{ role, playerId }`                  Private player role

  `phase_changed`       `{ phase, round }`                    Phase changed

  `vote_cast`           `{ voterId, targetId }`               Vote registered

  `player_eliminated`   `{ playerId, username }`              Player eliminated

  `game_over`           `{ winner }`                          Game over

  `chat_message`        `{ from, text, ts }`                  Chat message

  `ai_narration`        `{ text, ts }`                        AI narration
  -------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 🗄️ Data Model (ERD)

    users ──< players >── rooms
                             │
                        game_states

**Player roles:** `CIVILIAN · MAFIA · DETECTIVE · DOCTOR · NARRATOR`\
**Game phases:** `DAY → VOTING → NIGHT → DAY ...`\
**Room statuses:** `WAITING → IN_PROGRESS → FINISHED`

------------------------------------------------------------------------

## 🧪 Tests

``` bash
# Run coverage tests in each service
cd auth-service && npm run test:cov
cd game-service && npm run test:cov
cd ai-service   && npm run test:cov
```

------------------------------------------------------------------------

## 📚 Swagger UI

  Service   URL
  --------- --------------------------------
  Auth      http://localhost:3001/api/docs
  Game      http://localhost:3002/api/docs
  AI        http://localhost:3003/api/docs

------------------------------------------------------------------------

## 🔐 GitHub Actions Secrets (for deployment)

  Secret          Description
  --------------- ------------------------
  `EC2_HOST`      AWS instance IP/domain
  `EC2_USER`      SSH user (`ubuntu`)
  `EC2_SSH_KEY`   Private SSH key

------------------------------------------------------------------------

## 👥 Team

  Member               Role
  -------------------- --------------------------
  Tymofii Snisarenko   Scrum Master, QA, DevOps
  Andrii Butenko       Frontend & UI/UX
  Artem Kulinich       Fullstack AI & API
  Aliaksandr Dailid    Backend (Game Logic)
