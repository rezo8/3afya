# 3afya Architecture

## System Overview

3afya is a personal workout and health tracker built as a monorepo with the following high-level architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         3afya Monorepo                          │
│                     (pnpm + Turborepo)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐               │
│  │   apps/web      │         │   apps/api      │               │
│  │  React 19 + Vite │         │  Hono + Drizzle │               │
│  │  TanStack Router│◄────────►│  Postgres        │              │
│  │  Tailwind v4     │  HTTP   │  Better Auth    │               │
│  └─────────────────┘         └─────────────────┘               │
│         │                              │                         │
│         │                              │                         │
│         └──────────┬───────────────────┘                         │
│                    │                                             │
│                    ▼                                             │
│         ┌─────────────────┐                                      │
│         │ packages/shared │                                      │
│         │  (API contracts)│                                      │
│         └─────────────────┘                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
3afya/
├── apps/
│   ├── api/                    # Hono backend (port 3001)
│   │   ├── src/
│   │   │   ├── auth.ts         # Better Auth configuration
│   │   │   ├── index.ts        # Main Hono app with routing
│   │   │   ├── server.ts       # Entry point with migration runner
│   │   │   ├── db/             # Drizzle schema & database setup
│   │   │   │   ├── schema/
│   │   │   │   │   ├── tracker.ts    # Main domain schema
│   │   │   │   │   └── auth.ts       # Better Auth schema
│   │   │   │   └── index.ts          # Drizzle client setup
│   │   │   ├── routes/         # API route handlers
│   │   │   │   ├── exercises.ts
│   │   │   │   ├── programs.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── fuel.ts
│   │   │   │   ├── metrics.ts
│   │   │   │   ├── trends.ts
│   │   │   │   └── records.ts
│   │   │   ├── middleware/     # Custom middleware
│   │   │   │   └── require-auth.ts
│   │   │   ├── exercise-alternatives.ts  # Business logic
│   │   │   └── records.ts      # PR/trend calculations
│   │   └── drizzle/            # Generated migrations
│   └── web/                    # React frontend (port 5174)
│       ├── src/
│       │   ├── router.tsx      # TanStack Router configuration
│       │   ├── app/            # Layout components
│       │   │   ├── AppLayout.tsx    # Authenticated shell
│       │   │   └── TabBar.tsx       # Bottom navigation
│       │   ├── screens/        # Route components
│       │   │   ├── auth/       # Sign-in/Sign-up
│       │   │   ├── start/      # Today screen + Fuel panel
│       │   │   ├── session/    # Active workout session
│       │   │   ├── program/    # Program builder
│       │   │   ├── trends/     # Progress charts
│       │   │   ├── history/    # Session history
│       │   │   └── body/       # Body metrics
│       │   ├── components/     # Reusable components
│       │   │   └── charts/     # Chart components
│       │   ├── lib/            # Utilities
│       │   │   ├── auth/       # Better Auth client
│       │   │   ├── api/        # API client functions
│       │   │   └── query/      # TanStack Query hooks
│       │   └── main.tsx        # React entry point
│       └── dist/               # Production build output
└── packages/
    ├── shared/                 # Shared TypeScript types
    │   └── src/index.ts        # API contract types
    ├── eslint-config/         # Shared ESLint config
    └── tsconfig/              # Shared TypeScript configs
```

## Technology Stack

### Frontend (`apps/web`)
- **Framework**: React 19 + Vite 6
- **Routing**: TanStack Router (file-based routing)
- **Data Fetching**: TanStack Query (React Query)
- **Styling**: Tailwind CSS v4
- **Auth**: Better Auth client
- **TypeScript**: Strict mode, no escape hatches

### Backend (`apps/api`)
- **Framework**: Hono (lightweight web framework)
- **ORM**: Drizzle ORM with node-postgres
- **Database**: PostgreSQL (user data; sessions live in mi7rab's shared auth DB)
- **Auth**: Better Auth (email/password, Postgres-backed sessions)
- **Validation**: Zod
- **Testing**: Vitest

### Infrastructure
- **Package Manager**: pnpm with workspaces
- **Build System**: Turborepo
- **Runtime**: Node 22, ESM throughout
- **Containerization**: Docker Compose (local dev)
- **Deployment**: Cloud Run (GCP) - shared infra model

## Data Flow Architecture

```
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │ HTTP
       ▼
┌─────────────────────────────────────────────────────┐
│              Hono API (apps/api)                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐      ┌──────────────┐            │
│  │ Better Auth  │      │ API Routes   │            │
│  │ /api/auth/*  │      │ /api/*       │            │
│  └──────┬───────┘      └──────┬───────┘            │
│         │                      │                    │
│         │ Drizzle ORM          │ Drizzle ORM       │
│         │ (sessions)            │                   │
│         ▼                      ▼                    │
│  ┌──────────────┐      ┌──────────────┐            │
│  │ mi7rab auth  │      │  PostgreSQL   │            │
│  │ DB (shared)  │      │  (port 5435) │            │
│  └──────────────┘      └──────────────┘            │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Domain Model

### Core Entities

```
┌──────────────────────────────────────────────────────────────┐
│                      User (Better Auth)                       │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ user_id (FK)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                        Exercise Library                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ exercise (id, userId, name, kind,                    │   │
│  │          primaryMuscleGroup, equipment, archivedAt)   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ exercise_id (FK)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                         Program Structure                     │
│  ┌────────────────┐      ┌────────────────┐                 │
│  │   program      │─────►│  programDay    │                 │
│  │ (userId, name) │      │ (name, position)│                 │
│  └────────────────┘      └────────┬───────┘                 │
│                                   │                          │
│                                   │ day_id (FK)              │
│                                   ▼                          │
│                          ┌────────────────┐                 │
│                          │programExercise │                 │
│                          │(targetSets,    │                 │
│                          │ targetReps,    │                 │
│                          │ supersetGroup) │                 │
│                          └────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ day_id (FK, nullable)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      Workout Sessions                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ workoutSession (id, userId, dayId, dayName,          │   │
│  │                 performedAt, note)                   │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                     │
│                         │ session_id (FK)                     │
│                         ▼                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ setLog (id, sessionId, exerciseId, setNumber,        │   │
│  │         weight, reps, durationSec, distance,         │   │
│  │         distanceUnit, isWarmup)                      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ userId (FK)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      Fuel & Body Metrics                      │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ fuelEntry        │  │ nutritionTarget  │                 │
│  │ (label, protein, │  │ (protein,        │                 │
│  │  calories)       │  │  calories)       │                 │
│  └──────────────────┘  └──────────────────┘                 │
│  ┌──────────────────┐                                         │
│  │ bodyMetric       │                                         │
│  │ (kind, value,    │                                         │
│  │  measuredAt)     │                                         │
│  └──────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

### Key Relationships

- **Exercise → ProgramExercise**: One-to-many (exercises reused across program days)
- **Program → ProgramDay**: One-to-many (days in rotation order)
- **ProgramDay → ProgramExercise**: One-to-many (exercises in a day)
- **WorkoutSession → SetLog**: One-to-many (sets in a session)
- **Exercise → SetLog**: One-to-many (historical sets per exercise)
- **SetLog.exerciseId**: `onDelete: "restrict"` (prevents accidental data loss)
- **ProgramExercise.exerciseId**: `onDelete: "cascade"` (template references are disposable)

## API Architecture

### Route Structure

```
/api
├── /auth/*          (Better Auth - sign-in, sign-up, sessions)
├── /exercises       (CRUD + alternatives)
├── /programs        (Program + day + exercise management)
├── /sessions        (Workout session logging)
├── /fuel            (Nutrition tracking)
├── /metrics         (Body metrics)
├── /trends          (Progress trends)
└── /records         (Personal records)
```

### Middleware Stack

```
Request → Secure Headers → CORS → Rate Limit → Auth Check → Route Handler
```

1. **Secure Headers**: Applied globally to all responses
2. **CORS**: Configured per origin (wildcard in production)
3. **Rate Limit**: Applied to `/api/*` routes (except `/api/auth/*`)
4. **Auth Check**: `requireAuth` middleware validates session via Better Auth

### Error Handling

Global error handler catches unhandled exceptions and returns standardized error responses:

```typescript
{
  error: "internal_error",
  message: "Something went wrong. Please try again."
}
```

## Frontend Architecture

### Routing Structure

```
/ (StartScreen - Today's workout)
/session/$dayId (SessionScreen - Active workout)
/session/freeform (FreeformSessionScreen - Off-program workout)
/program (ProgramScreen - Program builder)
/fuel (FuelScreen - Nutrition: today's totals, quick-adds, log)
/trends (TrendsScreen - Progress charts)
/history (HistoryScreen - Session list)
/history/$sessionId (SessionDetailScreen - Past session)
/body (BodyScreen - Body metrics)
/sign-in (SignInScreen)
/sign-up (SignUpScreen)
```

### Component Hierarchy

```
AppLayout (Authenticated shell)
├── Top Bar
├── Tab Bar (Navigation)
└── Outlet (Route content)
    ├── StartScreen
    │   └── FuelSummaryCard (meters + 3 quick-adds, links to /fuel)
    ├── FuelScreen
    │   └── FuelPanel
    ├── SessionScreen
    │   └── RestTimer (Context provider)
    ├── ProgramScreen
    ├── TrendsScreen
    │   └── Chart Components
    ├── HistoryScreen
    │   └── SessionDetailScreen
    └── BodyScreen
```

### State Management

- **Server State**: TanStack Query (React Query) for API data
- **Client State**: React Context for rest timer
- **URL State**: TanStack Router for route parameters
- **Form State**: Controlled components with local state

### Key Patterns

1. **Armed Confirm**: Destructive actions require explicit confirmation
2. **Derived Focus**: Session screen exercise focus is computed, not stored
3. **Optimistic Updates**: TanStack Query for immediate UI feedback
4. **Error Boundaries**: Graceful error handling per screen

## Key Business Logic

### Exercise Catalog Tagging

Exercises are automatically tagged from a curated catalog:

```typescript
// Exact, case-insensitive lookup
const catalogEntry = findCatalogExercise(name);
if (catalogEntry) {
  exercise.primaryMuscleGroup = catalogEntry.group;
  exercise.equipment = catalogEntry.equipment;
}
```

- **Never fuzzy**: Exact match only to avoid wrong tags
- **Create-only**: Tags stamped on creation, not updated
- **Null-safe**: Unknown names stay untagged (honest degradation)

### Exercise Alternatives

Ranked by equipment priority:

1. User's library exercises (same muscle group, different equipment first)
2. Catalog entries (same muscle group, not in library)
3. Capped at 12 results
4. Untagged exercises return empty array

### Session Rotation

"Today" is the next day after the last session:

```typescript
const latestSession = mostRecentSession(userId);
const nextDay = programDays[(latestSession.dayPosition + 1) % totalDays];
```

- **Empty sessions**: Don't advance rotation (two separate queries)
- **Freeform sessions**: `dayId is null`, so they neither resume nor advance the rotation
- **Day name snapshot**: Sessions store day name for history integrity
- **Find-or-create**: Same day + calendar day returns existing session

### Record Detection

PRs calculated using Epley formula:

```typescript
est1rm = weight × (1 + reps / 30)
```

- **Warm-up filtering**: `isWarmup` sets excluded from PR calculations
- **Per-session**: Best set per session, then all-time best
- **Multi-dimensional**: est1rm, weight, volume, reps, duration

## Database Schema

### Core Tables

- **exercise**: User's exercise library
- **program**: Workout programs
- **program_day**: Days within a program
- **program_exercise**: Exercises in a day with targets
- **workout_session**: Completed workout sessions
- **set_log**: Individual sets logged in sessions
- **fuel_entry**: Nutrition entries
- **nutrition_target**: Daily nutrition targets (append-only)
- **body_metric**: Body measurements over time

### Key Indexes

- `exercise_user_name_idx`: Unique per user
- `set_log_exercise_completed_idx`: For "last session" queries
- `session_user_performed_idx`: For session history
- `fuel_entry_user_logged_idx`: For daily fuel queries

### Migration Strategy

- **Drizzle Kit**: Schema generation and migration
- **Custom Migrations**: For backfills and complex changes
- **Breaking Changes**: Rehearsed without touching dev database
- **On-startup**: Migrations run automatically in production

## Authentication Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │
     │ POST /api/auth/sign-up
     ▼
┌──────────────────┐
│  Better Auth     │
│  (validation)    │
└────┬─────────────┘
     │
     │ Create user (Postgres)
     ▼
┌──────────────────┐
│   PostgreSQL     │
│  (user table)    │
└──────────────────┘
     │
     │ Create session (Redis)
     ▼
┌──────────────────┐
│     Redis        │
│  (session token) │
└──────────────────┘
     │
     │ Set session cookie
     ▼
┌──────────┐
│  Client  │
└──────────┘
```

### Session Management

- **Storage**: Redis only (no database storage)
- **Cookie**: HttpOnly, SameSite=lax, secure in production
- **Cache**: 60-second signed cookie cache
- **Rate Limit**: 100 requests per 60-second window

## Development Workflow

### Local Development

```bash
# Start infrastructure
docker compose up -d

# Setup environment
cp .env.example apps/api/.env
# Set BETTER_AUTH_SECRET

# Install and migrate
pnpm install
pnpm --filter @afya/api db:migrate
pnpm --filter @afya/api db:seed  # Optional demo data

# Run development servers
pnpm dev
```

### Testing

```bash
# API tests
pnpm --filter @afya/api test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Build

```bash
# Build both apps
pnpm build

# Preview production build
pnpm --filter @afya/web preview
```

## Deployment Architecture

### Production Setup

```
GCP Cloud Run (afya service)
├── Web build output (served by Hono)
├── API server (Hono)
├── Shared Cloud SQL instance (mi7rab-db)
│   └── Logical database: afya
└── Shared Better Auth tables
```

### Infrastructure

- **Platform**: Google Cloud Run
- **Database**: Shared Cloud SQL (Postgres)
- **Cache**: Redis (Memorystore)
- **Build**: Cloud Build (cloudbuild.yaml)
- **Secrets**: Secret Manager
- **Domain**: afya-qjyft4sfwa-uc.a.run.app

### Shared Infra Model

- **Database**: Shared Cloud SQL instance across personal apps
- **Auth**: Shared Better Auth configuration
- **Cost**: Optimized through resource sharing
- **Isolation**: Separate logical databases per app

## Key Design Decisions

### Why This Stack?

- **Hono**: Lightweight, fast, excellent TypeScript support
- **Drizzle**: Type-safe ORM, no runtime overhead, great DX
- **Better Auth**: Embedded auth, no external dependencies
- **TanStack**: Best-in-class routing and data fetching
- **Tailwind v4**: Modern CSS utility framework
- **Redis**: Fast session storage, rate limiting

### Architecture Principles

1. **Type Safety First**: Strict TypeScript, no escape hatches
2. **Separation of Concerns**: Clear boundaries between API and web
3. **Shared Contracts**: Single source of truth in `@afya/shared`
4. **Immutable History**: Sessions are snapshots, not mutable templates
5. **Data Integrity**: Foreign key constraints prevent accidental loss
6. **Performance**: Indexed queries, Redis caching, optimistic updates

### Trade-offs

- **No session-exercise join table**: Simpler schema, ad-hoc exercises handled in code
- **Redis-only sessions**: Faster, but requires Redis availability
- **Catalog tagging**: Exact match only (safety over convenience)
- **Append-only targets**: More storage, but accurate historical scoring

## Security Considerations

- **CORS**: Wildcard in production (intentional for personal app)
- **CSRF**: Protected via Better Auth trusted origins
- **Rate Limiting**: Applied to all API routes
- **Session Security**: HttpOnly cookies, secure in production
- **SQL Injection**: Prevented via parameterized queries (Drizzle)
- **XSS**: Mitigated via React's built-in escaping

## Performance Optimizations

- **Database Indexing**: Strategic indexes on common query patterns
- **Redis Caching**: Session data, rate limit counters
- **Optimistic Updates**: Immediate UI feedback via TanStack Query
- **Code Splitting**: TanStack Router's route-based splitting
- **Asset Hashing**: Aggressive browser caching for production builds
- **Connection Pooling**: node-postgres pool for database connections

## Monitoring & Observability

- **Error Logging**: Global error handler with user context
- **Health Check**: `/health` endpoint for uptime monitoring
- **Migration Logging**: Console output on startup
- **Rate Limit Monitoring**: Redis-based counters

## Future Considerations

- **Real-time Updates**: WebSocket support for live session sync
- **Offline Support**: Service worker for offline workout logging
- **Export/Import**: Data portability features
- **Advanced Analytics**: More sophisticated trend analysis
- **Social Features**: Sharing programs/sessions (if desired)
