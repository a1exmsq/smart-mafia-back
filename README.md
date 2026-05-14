# 🎭 Smart Mafia — AI-Powered Party Game

> A real-time multiplayer Mafia party game with an AI narrator powered by OpenAI GPT-4o-mini.
> Players are assigned secret roles, survive the night, vote out suspects, and listen to dramatic AI-generated narration for every game event.

![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?style=flat-square&logo=socketdotio)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=flat-square&logo=openai)

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🔐 **Auth** | JWT access + refresh tokens, bcrypt password hashing |
| 🎮 **Real-time game** | Socket.io gateway — roles, phases, votes, chat all sync live |
| 🤖 **AI narrator** | GPT-4o-mini generates dramatic narration for every game event |
| 🎭 **Roles** | Mafia, Detective, Doctor, Civilian — all with unique night actions |
| 🗳️ **Voting** | Day voting with automatic elimination on majority |
| 🌙 **Night actions** | Mafia kills, Detective investigates, Doctor protects — resolved server-side |
| 🏠 **Rooms** | Create / join rooms with 4-digit codes, avatar picker |
| 🐳 **Docker** | Full stack runs with a single `docker compose up` |

---

## 🏗️ Architecture

```
        ┌─────────────────────────────────────────────┐
        │   Next.js 15 (App Router)  ·  CSS Modules   │
        └──────────────────┬──────────────────────────┘
                           │  REST + Socket.io
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐
   │auth-service │  │game-service │  │ ai-service │
   │   :3001     │  │ :3002/:3012 │  │   :3003    │
   │             │  │             │  │            │
   │ JWT + Users │  │ Rooms, Game │  │ GPT-4o-m.  │
   │  bcrypt     │  │ Socket.io   │  │ Narration  │
   └──────┬──────┘  └──────┬──────┘  └────────────┘
          │                │
   ┌──────▼────────────────▼──────┐
   │       PostgreSQL :5432       │
   │  users · rooms · players     │
   │  game_states                 │
   └──────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 10, TypeScript, Prisma ORM, JWT auth, bcrypt |
| **Real-time** | Socket.io 4 (WebSocket gateway in `game-service`) |
| **Frontend** | Next.js 15 (App Router), CSS Modules |
| **AI** | OpenAI GPT-4o-mini — generates narration and chat responses |
| **Database** | PostgreSQL 15 |
| **Infrastructure** | Docker Compose (all services + DB in one command) |

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ *(only for local dev without Docker)*
- OpenAI API key *(optional — mock responses used without it)*

### 1. Configure environment

```bash
cp smart-mafia-back/auth-service/.env.example smart-mafia-back/auth-service/.env
cp smart-mafia-back/game-service/.env.example smart-mafia-back/game-service/.env
cp smart-mafia-back/ai-service/.env.example smart-mafia-back/ai-service/.env
```

Fill in `smart-mafia-back/ai-service/.env`:

```env
OPENAI_API_KEY=sk-...    # get at platform.openai.com
```

### 2. Start backend with Docker

```bash
cd smart-mafia-back
docker compose up -d
```

### 3. Run database migrations

```bash
docker compose exec auth-service npx prisma migrate deploy
docker compose exec game-service npx prisma migrate deploy
```

### 4. Run the frontend

```bash
cd smart-mafia
npm install
npm run dev
```

App → `http://localhost:3000`

---

## 🗂️ Repository Structure

```
smart-mafia/               # Next.js 15 frontend (:3000)
│   ├── app/               # App Router pages
│   └── components/
│       └── GameRoom/      # Game UI — roles, voting, chat, AI narrator
│
smart-mafia-back/          # NestJS microservices
    ├── auth-service/      # JWT auth + users (:3001)
    ├── game-service/      # Game logic + Socket.io (:3002/:3012)
    ├── ai-service/        # OpenAI narrator (:3003)
    └── docker-compose.yml
```

---

## 💡 Technical Highlights

- **Microservice architecture** — three independent NestJS services with their own DB connections
- **Real-time sync** — Socket.io gateway broadcasts every state change to all room participants
- **Private role delivery** — `your_role` event sent only to the specific player's socket
- **AI narration** — after each phase transition the AI service generates suspenseful in-character narration
- **JWT auth across services** — game-service verifies tokens independently (same `JWT_SECRET`)

---

## 👥 Team

| Member | Role |
|--------|------|
| Tymofii Snisarenko | Scrum Master, QA, DevOps |
| Andrii Butenko | Frontend & UI/UX |
| Artem Kulinich | Fullstack, AI & API |
| **Aliaksandr Dailid** | Backend — Game Logic |

[![GitHub](https://img.shields.io/badge/GitHub-a1exmsq-181717?style=flat-square&logo=github)](https://github.com/a1exmsq)
