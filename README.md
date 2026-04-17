# Backend Stage 1 — Profile API

A REST API that accepts a name, enriches it with gender, age, and nationality data from external APIs, stores the result, and exposes endpoints to manage profiles.

## Tech Stack
- Node.js + Express
- SQLite (better-sqlite3)
- UUID v7

## External APIs Used
- [Genderize](https://api.genderize.io)
- [Agify](https://api.agify.io)
- [Nationalize](https://api.nationalize.io)

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/profiles | Create a profile |
| GET | /api/profiles | Get all profiles (filterable) |
| GET | /api/profiles/:id | Get single profile |
| DELETE | /api/profiles/:id | Delete a profile |

## Running Locally

```bash
npm install
node index.js
```

Server runs on port 3000.

## Filters (GET /api/profiles)
- `?gender=male`
- `?country_id=NG`
- `?age_group=adult`
- Combinable, case-insensitive