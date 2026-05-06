# 🃏 Smart Mafia — AI Voice Companion

> A real-time Mafia party game with an AI-powered host. Built with Next.js, Socket.io, and OpenAI.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), CSS Modules |
| Real-time | Socket.io (planned) |
| AI Host | OpenAI API / Claude API |
| Database | PostgreSQL (planned) |
| DevOps | Docker, GitHub Actions, AWS EC2 |

---

## 🗂 Project Structure

```
mafia-app/
├── app/
│   ├── globals.css          # Design tokens, base styles
│   ├── layout.js            # Root layout
│   ├── page.js              # Landing page (/)
│   ├── join/
│   │   └── page.js          # Join or create room (/join)
│   └── room/
│       └── page.js          # Game room (/room)
├── components/
│   ├── Navbar/              # Fixed top navigation
│   ├── Hero/                # Landing hero section
│   ├── HowItWorks/          # 3-step explainer
│   ├── Features/            # Feature grid
│   ├── Team/                # Team cards
│   ├── Footer/              # Footer
│   ├── JoinRoom/            # Join/Create room form + avatar picker
│   └── GameRoom/            # Game interface, chat, voting, roles
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=sk-your-key-here
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🎮 How the App Works (Current MVP)

### Pages

| Route | Description |
|---|---|
| `/` | Landing page with hero, features, team |
| `/join` | Two-panel form — join existing room or create new one |
| `/room` | Full game interface |

### Game Flow

1. Player goes to `/join`
2. Enters their **name**, picks an **emoji avatar**
3. Either enters a **room code** (join) or gets a **generated code** (create)
4. Player data is saved to `sessionStorage` and they're redirected to `/room`
5. In the room: host starts the game → roles assigned → phases cycle Night → Day → Vote
6. AI host responds to each phase transition and player messages

### Roles

| Role | Ability |
|---|---|
| 🔫 Mafia | Eliminate a citizen each night |
| 🔍 Detective | Investigate one player each night |
| 💊 Doctor | Save one player each night |
| 👤 Citizen | Vote out the Mafia during the day |

### AI Host (current: mock)

The AI host has a pool of atmospheric, noir-style responses per game phase. When real API is connected, it receives full game state (alive players, phase, chat history) and responds in character.

---

## 🔌 What's Needed for Full Multiplayer

### 1. OpenAI API Key
```env
OPENAI_API_KEY=sk-...
```
Enables the real AI host. Without it, the mock response pool is used.

### 2. Socket.io Backend Server

A Node.js server is needed to sync game state across all players in real time.

Planned endpoints:
- `join-room` — player joins a room
- `start-game` — host starts, server assigns roles
- `phase-change` — host advances phase, all clients update
- `cast-vote` — player vote broadcast to room
- `chat-message` — message relayed to all players

Deploy target: **AWS EC2** (as per project plan) or Railway/Render for quick testing.

### 3. PostgreSQL Database (optional for MVP)

For persisting rooms between server restarts.

Tables planned:
- `rooms` — code, phase, created_at
- `players` — name, avatar, role, room_id, status
- `messages` — room_id, player_id, content, timestamp

---

## 🐳 Docker (Planned)

```yaml
# docker-compose.yml (planned)
services:
  frontend:
    build: .
    ports:
      - "3000:3000"
  backend:
    build: ./server
    ports:
      - "4000:4000"
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: mafia
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
```

---

## 🔄 CI/CD (Planned)

GitHub Actions pipeline on push to `main`:

1. Install dependencies
2. Run linter
3. Run tests (Jest)
4. Build Docker image
5. Push to AWS EC2

---

## 👥 Team

| Name | Role |
|---|---|
| Tymofii Snisarenko | Scrum Master · QA · DevOps |
| Andrii Butenko | Frontend · UI/UX |
| Artem Kulinich | Backend · Game Logic |
| Aliaksandr Dailid | Fullstack · AI & API |

---

## 📋 Project Context

---

## 📄 License

MIT — Academic project, 2025.
