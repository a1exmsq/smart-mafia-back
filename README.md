# 🎭 Smart Mafia Voice Companion — Backend

Микросервисный бэкенд для интерактивной игры "Мафия" с ИИ-ведущим.  
Стек: **NestJS · PostgreSQL · Prisma · Socket.io · OpenAI · Docker**

---

## 📐 Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        React Client                          │
│              REST (HTTP) + Socket.io (WebSocket)             │
└──────────┬──────────────────────┬──────────────┬────────────┘
           │                      │              │
    ┌──────▼──────┐     ┌─────────▼──────┐  ┌───▼──────────┐
    │ auth-service │     │  game-service  │  │  ai-service   │
    │   :3001      │     │  :3002 / :3012 │  │   :3003       │
    │              │     │                │  │               │
    │  JWT Auth    │     │ Rooms, Players │  │  OpenAI API   │
    │  Users CRUD  │     │ Game State     │  │  Narration    │
    │  bcrypt      │     │ Socket.io GW   │  │  Chat         │
    └──────┬───────┘     └───────┬────────┘  └───────────────┘
           │                     │
    ┌──────▼─────────────────────▼────┐
    │         PostgreSQL :5432         │
    │  users · rooms · players         │
    │  game_states                     │
    └──────────────────────────────────┘
```

## 📁 Структура проекта

```
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
```

---

## 🚀 Быстрый старт

### 1. Локально (Docker Compose)

```bash
git clone <repo>
cd smart-mafia-backend

# Создать .env файлы из примеров
cp auth-service/.env.example auth-service/.env
cp game-service/.env.example game-service/.env
cp ai-service/.env.example ai-service/.env

# Вставить OPENAI_API_KEY в ai-service/.env

# Запустить всё
docker compose up -d

# Накатить миграции
docker compose exec auth-service npx prisma migrate deploy
docker compose exec game-service npx prisma migrate deploy
```

### 2. Локально без Docker

```bash
# Нужен PostgreSQL на localhost:5432

cd auth-service && npm install && npx prisma migrate dev && npm run start:dev
cd game-service && npm install && npx prisma migrate dev && npm run start:dev
cd ai-service  && npm install && npm run start:dev
```

---

## 📡 API Endpoints

### Auth Service `http://localhost:3001`

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/auth/register` | Регистрация игрока |
| `POST` | `/auth/login` | Логин → JWT токены |
| `POST` | `/auth/refresh` | Обновить токен |
| `GET`  | `/auth/health` | Health check |
| `GET`  | `/users/me` | Профиль текущего пользователя |

### Game Service `http://localhost:3002`

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/rooms` | Создать комнату |
| `GET`  | `/rooms` | Список активных комнат |
| `GET`  | `/rooms/:code` | Получить комнату по коду |
| `PATCH`| `/rooms/:id/start` | Начать игру (только хост) |
| `POST` | `/players/join` | Войти в комнату |
| `DELETE`| `/players/leave/:roomId` | Покинуть комнату |
| `GET`  | `/players/room/:roomId` | Список игроков |
| `POST` | `/game/:roomId/init` | Инициализировать состояние |
| `GET`  | `/game/:roomId/state` | Текущий снапшот игры |
| `POST` | `/game/:roomId/advance` | Следующая фаза |
| `POST` | `/game/:roomId/vote` | Проголосовать |
| `POST` | `/game/:roomId/resolve-votes` | Подвести итоги голосования |

### AI Service `http://localhost:3003`

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/ai/narrate` | Генерация нарратива для события |
| `POST` | `/ai/chat` | Чат с ведущим |
| `GET`  | `/ai/health` | Проверка OpenAI |

---

## 🔌 Socket.io Events

**Namespace:** `/game`  
**Auth:** передать `token` в `socket.auth` или `Authorization` header

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{ roomCode }` | Войти в комнату |
| `leave_room` | — | Покинуть комнату |
| `send_message` | `{ text }` | Чат сообщение |
| `player_ready` | — | Готов к игре |
| `cast_vote` | `{ voterId, targetId }` | Проголосовать |
| `request_ai_narration` | `{ prompt }` | Запрос нарратива |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room_joined` | `{ roomId, code, players, hostId }` | Подтверждение входа |
| `player_joined` | `{ userId, username }` | Новый игрок |
| `game_started` | `{ gameState }` | Игра началась |
| `your_role` | `{ role, playerId }` | Приватная роль игрока |
| `phase_changed` | `{ phase, round }` | Смена фазы |
| `vote_cast` | `{ voterId, targetId }` | Голос зарегистрирован |
| `player_eliminated` | `{ playerId, username }` | Игрок выбыл |
| `game_over` | `{ winner }` | Конец игры |
| `chat_message` | `{ from, text, ts }` | Сообщение в чате |
| `ai_narration` | `{ text, ts }` | Нарратив от ИИ |

---

## 🗄️ Модель данных (ERD)

```
users ──< players >── rooms
                         │
                    game_states
```

**Роли игроков:** `CIVILIAN · MAFIA · DETECTIVE · DOCTOR · NARRATOR`  
**Фазы игры:** `DAY → VOTING → NIGHT → DAY ...`  
**Статусы комнаты:** `WAITING → IN_PROGRESS → FINISHED`

---

## 🧪 Тесты

```bash
# Запустить тесты с покрытием в каждом сервисе
cd auth-service && npm run test:cov
cd game-service && npm run test:cov
cd ai-service   && npm run test:cov
```

---

## 📚 Swagger UI

| Сервис | URL |
|--------|-----|
| Auth   | http://localhost:3001/api/docs |
| Game   | http://localhost:3002/api/docs |
| AI     | http://localhost:3003/api/docs |

---

## 🔐 GitHub Actions Secrets (для деплоя)

| Secret | Description |
|--------|-------------|
| `EC2_HOST` | IP/домен AWS инстанса |
| `EC2_USER` | SSH пользователь (`ubuntu`) |
| `EC2_SSH_KEY` | Приватный SSH ключ |

---

## 👥 Команда

| Участник | Роль |
|----------|------|
| Tymofii Snisarenko | Scrum Master, QA, DevOps |
| Andrii Butenko | Frontend & UI/UX |
| Artem Kulinich | Backend (Game Logic) |
| Aliaksandr Dailid | Fullstack AI & API |
