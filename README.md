# Backend Stage 2 — Intelligence Query Engine

An upgraded REST API for Insighta Labs that supports advanced filtering, sorting, pagination, and natural language search across 2026 demographic profiles.

## Tech Stack
- Node.js + Express
- SQLite (better-sqlite3)
- UUID v7

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/profiles | Create a profile |
| GET | /api/profiles | Get all profiles (filterable, sortable, paginated) |
| GET | /api/profiles/search | Natural language search |
| GET | /api/profiles/:id | Get single profile |
| DELETE | /api/profiles/:id | Delete a profile |

## Running Locally

```bash
npm install
node seed.js
node index.js
```

Server runs on port 3000.

---

## GET /api/profiles — Supported Parameters

### Filters
| Parameter | Example | Description |
|-----------|---------|-------------|
| gender | male / female | Filter by gender |
| age_group | child / teenager / adult / senior | Filter by age group |
| country_id | NG / KE / GH | ISO country code |
| min_age | 20 | Minimum age (inclusive) |
| max_age | 40 | Maximum age (inclusive) |
| min_gender_probability | 0.8 | Minimum gender confidence |
| min_country_probability | 0.5 | Minimum country confidence |

### Sorting
| Parameter | Values | Default |
|-----------|--------|---------|
| sort_by | age, created_at, gender_probability | created_at |
| order | asc, desc | desc |

### Pagination
| Parameter | Default | Max |
|-----------|---------|-----|
| page | 1 | — |
| limit | 10 | 50 |

All filters are combinable. Example:

/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10

---

## GET /api/profiles/search — Natural Language Parsing

### How it works
The parser reads a plain English query string and maps keywords to filters using pattern matching. No AI or LLMs are used.

### Supported keywords and mappings

| Keyword / Pattern | Maps to |
|-------------------|---------|
| "male" / "males" | gender=male |
| "female" / "females" | gender=female |
| "child" / "children" | age_group=child |
| "teenager" / "teenagers" | age_group=teenager |
| "adult" / "adults" | age_group=adult |
| "senior" / "seniors" | age_group=senior |
| "young" | min_age=16, max_age=24 |
| "above X" / "over X" | min_age=X |
| "below X" / "under X" | max_age=X |
| "between X and Y" | min_age=X, max_age=Y |
| "from nigeria" / "from kenya" etc. | country_id lookup |

### Country support
The parser recognises country names and maps them to ISO codes. Supported countries include all major African nations plus common global ones (US, UK, France, Germany, Brazil, India, China, Japan, etc.).

### Example queries

young males from nigeria         → gender=male, min_age=16, max_age=24, country_id=NG
females above 30                 → gender=female, min_age=30
adult males from kenya           → gender=male, age_group=adult, country_id=KE
teenagers below 18               → age_group=teenager, max_age=18
people from ghana                → country_id=GH
seniors from south africa        → age_group=senior, country_id=ZA

---

## Limitations

- **"young" is not a stored age_group** — it maps to ages 16–24 for search purposes only
- **No synonym support** — "men" and "women" are not recognised, only "male/males" and "female/females"
- **No spelling correction** — typos like "nigria" will not match Nigeria
- **Single country per query** — only the first matched country is used
- **No negation** — queries like "not from nigeria" are not supported
- **No OR logic** — "males or females" is not supported; filters are always AND
- **Ambiguous gender queries** — "male and female" will not set a gender filter since both are detected
- **Limited country list** — only countries explicitly listed in the map are recognised
- **No age range by label** — "middle aged" or "elderly" are not mapped
- **No name-based search** — searching by a person's name is not supported