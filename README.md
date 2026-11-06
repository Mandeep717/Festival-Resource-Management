# Common Ground — Festival Resource Management

Common Ground is a campus festival management prototype. It provides public festival browsing and role-based workspaces for attendees, volunteers, organizers, and administrators. The system supports festival planning, session registration, participant and volunteer coordination, venue and resource management, schedule publishing, and AI-powered festival guidance.

The application runs locally as a React frontend, an Express API, a MongoDB database, and an Ollama model service. This repository does not currently have a hosted production demo.

## Contents

- [Features](#features)
- [Technology](#technology)
- [How the prototype works](#how-the-prototype-works)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Initial walkthrough](#initial-walkthrough)
- [Validation and testing](#validation-and-testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Screenshots](#screenshots)

## Features

### Public visitors

- Browse festivals and published schedules.
- Open the public Festival Guide at `/festival-guide` without signing in or joining a festival.
- Ask about festival dates, location, registration details, and published public documents.
- Continue a conversation in the same browser using an HTTP-only visitor cookie. Visitors can retrieve only public material.

### Attendees

- Create an account, register for festivals and sessions, and review personal registrations.
- Cancel registrations and join or leave a session waitlist when capacity is full.
- Ask the Festival Guide questions from the attendee workspace.

### Organizers

- Create and update festivals, including their registration windows and status.
- Request access to festivals managed by another organizer; an administrator can review the request.
- Manage sessions, venues, resources, volunteer shifts, event documents, and schedule drafts.
- Review session proposals, participant lists, and attendance; mark registered attendees as checked in or no-shows.
- Validate schedules, inspect conflicts, and publish a schedule.
- Use the operations assistant to explore a possible session move. It produces a proposal and does not change the schedule automatically.

### Volunteers

- Request membership in a festival and submit session proposals for organizer review.
- View assigned shifts and update shift status.
- Access staff guidance when they have active membership in the festival.

### Administrators

- View platform totals and manage users, festival memberships, venues, and resources.
- Create and update venues and resources and change their operational status.
- Review membership requests and update account or membership status.
- Admin accounts are provisioned directly in MongoDB. The application does not provide an admin registration route.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React, React Router, Vite, Tailwind CSS, lucide-react |
| API | Node.js, Express 5 |
| Data layer | MongoDB, Mongoose |
| Authentication | bcryptjs password hashing, JWT sessions in HTTP-only cookies, role and membership checks |
| AI | LangChain with Ollama `qwen3:4b` |
| Document retrieval | `unpdf` text extraction, chunking, Ollama `embeddinggemma`, MongoDB Atlas Vector Search |

## How the prototype works

The frontend calls the Express API through the `/api` path. During development, Vite proxies those requests to the API at `http://localhost:4000`. The API persists user accounts, festivals, memberships, venues, resources, sessions, registrations, waitlist entries, shifts, schedule versions, documents, document chunks, conversations, and incidents in MongoDB.

Mongoose schemas validate stored fields and define relationships and indexes. Registration and waitlist updates use transactions to keep capacity changes consistent. MongoDB transactions require a replica set; MongoDB Atlas provides one.

The AI guide adds the selected festival's stored details to the question context and can retrieve relevant excerpts from uploaded public documents. Answers cite retrieved excerpts when available. Active festival members may access additional document visibility according to their role. Public visitors only receive public festival details and public documents.

Organizers upload text-based PDF guides and policies. The API extracts text, splits it into chunks, creates embeddings, and stores the content and vectors in MongoDB. MongoDB Atlas Vector Search retrieves relevant chunks for a question. The separate operations assistant uses read-only schedule tools to propose possible schedule changes; organizers remain responsible for applying changes.

## Requirements

- Node.js `20.19+` or `22.12+` and npm.
- MongoDB Atlas or another MongoDB replica set.
- Ollama reachable by the API server.
- A MongoDB Atlas Vector Search index named `festival_index` on the `chunks` collection for uploaded-document retrieval.

The configured `embeddinggemma` model outputs 768-dimensional vectors by default. The Atlas index must use the same dimensions and similarity setting as the vectors generated by the API. Refer to the [Ollama embeddinggemma model](https://ollama.com/library/embeddinggemma), [MongoDB Vector Search index documentation](https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/), and [MongoDB replica set documentation](https://www.mongodb.com/docs/manual/replication/).

Create the `festival_index` Vector Search index in Atlas for the `chunks` collection with this definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "festivalId" },
    { "type": "filter", "path": "documentId" },
    { "type": "filter", "path": "visibility" }
  ]
}
```

If you change the embedding model or vector dimensions, re-index the stored chunks and update the Atlas index. Stored document vectors and query vectors must use the same model and dimensions.

## Local setup

### 1. Install dependencies

From the repository root:

```bash
npm install
npm --prefix Frontend install
```

### 2. Configure MongoDB and environment variables

Create a MongoDB database user and allow your development machine to connect to the cluster. Use a replica-set-enabled MongoDB URI. The example below uses the database name `festivalDB`; replace it with the database selected for your environment.

Copy `.env.example` to `.env` in the repository root and configure the values:

```dotenv
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/festivalDB?retryWrites=true&w=majority
JWT_SECRET=<a-long-random-secret>
JWT_EXPIRES_IN=1d
CLIENT_ORIGIN=http://localhost:5173
# Optional; defaults to http://localhost:11434
LLM_URL=http://localhost:11434
```

Generate a random secret with Node.js:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

Do not commit `.env`, database credentials, or generated secrets. If Vite selects a different port because `5173` is already in use, add the frontend origin to `CLIENT_ORIGIN`. Multiple origins can be comma-separated.

### 3. Install and start the AI models

Install Ollama for your operating system and start its local service. Download the models used by the application:

```bash
ollama pull qwen3:4b
ollama pull embeddinggemma
```

The API uses `qwen3:4b` to generate responses and `embeddinggemma` to embed document chunks and questions. Keep Ollama reachable at `LLM_URL` while using the AI guide or uploading documents.

### 4. Provision the first administrator

Admin accounts are created directly in the database. Generate a bcrypt password hash from the repository root:

```bash
node --input-type=module -e "import { hash } from 'bcryptjs'; console.log(await hash('REPLACE_WITH_A_STRONG_PASSWORD', 12))"
```

In MongoDB Compass, open the database configured in `MONGODB_URI`, select the `users` collection, and insert this document with the generated hash in `password`:

```json
{
  "name": "Festival Admin",
  "email": "admin@example.com",
  "password": "PASTE_BCRYPT_HASH_HERE",
  "accountType": "admin",
  "status": "active",
  "lastLogIn": null,
  "emailVerifiedAt": null,
  "createdAt": { "$date": "2026-11-04T00:00:00.000Z" },
  "updatedAt": { "$date": "2026-11-04T00:00:00.000Z" }
}
```

Sign in with the email and original password used to create the hash. MongoDB can generate `_id` automatically. The email address must be unique.

### 5. Start the API and frontend

Open two terminals in the repository root.

Terminal 1 — API:

```bash
npm run dev:api
```

The API connects to MongoDB before it starts listening on port `4000`. Confirm that the terminal reports a successful database connection.

Terminal 2 — frontend:

```bash
npm run dev
```

Open the Vite URL printed in the terminal, normally [http://localhost:5173](http://localhost:5173). The development server proxies `/api` requests to `http://localhost:4000`.

## Initial walkthrough

1. Open the public site and select **Festival Guide** to ask a question without signing in.
2. Register an organizer account and create a festival with a unique slug, location, dates, and registration window.
3. Add venues and resources, then create sessions using those records.
4. Register an attendee account, open the festival page, register for the festival, and reserve a session.
5. Register a volunteer account and request access to the festival.
6. Sign in as the seeded administrator to review membership requests and manage users, venues, and resources.
7. Sign in as the organizer to assign volunteers, review attendees, record attendance, and prepare and publish a schedule.
8. Upload a text-based PDF with `public` visibility through **Event documents**. Ask the guide a question about its content and check the answer's source citations.

## Validation and testing

Available frontend checks:

```bash
npm run lint:frontend
npm run build:frontend
```

There is no automated backend or integration test suite configured. The root `npm test` command is currently a placeholder. For manual verification, follow the [initial walkthrough](#initial-walkthrough) and check invalid dates, invalid IDs and statuses, duplicate emails or slugs, full-session waitlists, unauthorized admin requests, and public-guide access without festival membership.

## Deployment

No hosting provider or live demo URL is configured in this repository. For deployment, build the frontend with `npm run build:frontend`, serve the generated `Frontend/dist` directory, and route `/api` requests to the Express API so the frontend's relative API URLs continue to work.

Configure production values for `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`, and `LLM_URL`. Use HTTPS so production cookies can be marked secure. The API host must be able to reach MongoDB and Ollama, and the Atlas Vector Search index must be ready before using uploaded-document retrieval.

## Project structure

```text
.
├── Backend/
│   ├── APIs/           # Public, attendee, volunteer, organizer, and admin routes
│   ├── Middlewares/    # Authentication, role checks, and request limits
│   ├── Models/         # Mongoose schemas and indexes
│   ├── Services/       # Validation, transactions, AI, PDF, and schedule logic
│   └── Tools/          # Read-only schedule operations tools
├── Frontend/
│   └── src/            # React pages, workspace UI, auth, and API client
├── Screenshot_outputs/ # Screenshots included below
├── server.js           # Express API entry point
└── .env.example        # Local configuration template
```

## Screenshots

### Public festival browsing

![Public festival listing](<Screenshot_outputs/Public Festival Page.png>)

### Account registration

![Account registration](<Screenshot_outputs/User create account and login.png>)

### Organizer workspace and session management

![Organizer creates a festival](<Screenshot_outputs/Organizer Create Festival.png>)

![Organizer workspace](<Screenshot_outputs/Organizer_Dashboard.png>)

![Session management](<Screenshot_outputs/Sessions management.png>)

### Attendee registration

![Festival registration](<Screenshot_outputs/Attendee registration.png>)

### AI festival guide

![AI festival guide in the attendee workspace](<Screenshot_outputs/AI chatbot.png>)

### Administrator workspace

![Admin dashboard](<Screenshot_outputs/Admin Dashboard.png>)

### Responsive workspace

![Mobile responsive workspace](<Screenshot_outputs/Responsive page.png>)

## Demo video

[Watch the Common Ground demo on YouTube](https://www.youtube.com/watch?v=h3Co1vbODkY)
