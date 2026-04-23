const express = require("express");
const { v7: uuidv7 } = require("uuid");
const db = require("./database");

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Age classification
function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

// Country code map for natural language search
const countryMap = {
  nigeria: "NG", ghana: "GH", kenya: "KE", tanzania: "TZ", uganda: "UG",
  ethiopia: "ET", senegal: "SN", cameroon: "CM", angola: "AO", mali: "ML",
  niger: "NE", burkina: "BF", "burkina faso": "BF", madagascar: "MG",
  malawi: "MW", zambia: "ZM", zimbabwe: "ZW", mozambique: "MZ",
  "south africa": "ZA", egypt: "EG", algeria: "DZ", morocco: "MA",
  tunisia: "TN", libya: "LY", sudan: "SD", somalia: "SO", rwanda: "RW",
  burundi: "BI", togo: "TG", benin: "BJ", guinea: "GN", sierra: "SL",
  "sierra leone": "SL", liberia: "LR", "ivory coast": "CI", "cote d'ivoire": "CI",
  congo: "CG", drc: "CD", gabon: "GA", chad: "TD", namibia: "NA",
  botswana: "BW", lesotho: "LS", swaziland: "SZ", eswatini: "SZ",
  gambia: "GM", "cape verde": "CV", comoros: "KM", mauritius: "MU",
  seychelles: "SC", eritrea: "ER", djibouti: "DJ", "equatorial guinea": "GQ",
  "guinea-bissau": "GW", "sao tome": "ST", uk: "GB", "united kingdom": "GB",
  britain: "GB", england: "GB", usa: "US", "united states": "US", america: "US",
  france: "FR", germany: "DE", italy: "IT", spain: "ES", portugal: "PT",
  brazil: "BR", india: "IN", china: "CN", japan: "JP", indonesia: "ID",
};

// Build filtered query helper
function buildProfilesQuery(filters, sort_by, order, page, limit) {
  const validSortFields = ["age", "created_at", "gender_probability"];
  const validOrders = ["asc", "desc"];

  const sortField = validSortFields.includes(sort_by) ? sort_by : "created_at";
  const sortOrder = validOrders.includes((order || "").toLowerCase()) ? order.toLowerCase() : "desc";
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
  const offset = (pageNum - 1) * limitNum;

  let where = "WHERE 1=1";
  const params = [];

  if (filters.gender) { where += " AND LOWER(gender) = ?"; params.push(filters.gender.toLowerCase()); }
  if (filters.age_group) { where += " AND LOWER(age_group) = ?"; params.push(filters.age_group.toLowerCase()); }
  if (filters.country_id) { where += " AND LOWER(country_id) = ?"; params.push(filters.country_id.toLowerCase()); }
  if (filters.min_age) { where += " AND age >= ?"; params.push(parseInt(filters.min_age)); }
  if (filters.max_age) { where += " AND age <= ?"; params.push(parseInt(filters.max_age)); }
  if (filters.min_gender_probability) { where += " AND gender_probability >= ?"; params.push(parseFloat(filters.min_gender_probability)); }
  if (filters.min_country_probability) { where += " AND country_probability >= ?"; params.push(parseFloat(filters.min_country_probability)); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM profiles ${where}`).get(...params).count;
  const data = db.prepare(`SELECT * FROM profiles ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, limitNum, offset);

  return { total, data, pageNum, limitNum };
}

// POST /api/profiles
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ status: "error", message: "Missing or empty name" });
  }

  const cleanName = name.trim().toLowerCase();

  const existing = db.prepare("SELECT * FROM profiles WHERE name = ?").get(cleanName);
  if (existing) {
    return res.status(200).json({ status: "success", message: "Profile already exists", data: existing });
  }

  try {
    const [genderRes, agifyRes, nationalizeRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${cleanName}`),
      fetch(`https://api.agify.io?name=${cleanName}`),
      fetch(`https://api.nationalize.io?name=${cleanName}`),
    ]);

    const [genderData, agifyData, nationalizeData] = await Promise.all([
      genderRes.json(), agifyRes.json(), nationalizeRes.json(),
    ]);

    if (!genderData.gender || genderData.count === 0) {
      return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
    }
    if (agifyData.age === null || agifyData.age === undefined) {
      return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
    }
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
    }

    const topCountry = nationalizeData.country.reduce((a, b) => a.probability > b.probability ? a : b);

    // Get country name from a lookup
    const countryNameLookup = Object.entries(countryMap).find(([, code]) => code === topCountry.country_id);
    const countryName = countryNameLookup
      ? countryNameLookup[0].charAt(0).toUpperCase() + countryNameLookup[0].slice(1)
      : topCountry.country_id;

    const profile = {
      id: uuidv7(),
      name: cleanName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: agifyData.age,
      age_group: getAgeGroup(agifyData.age),
      country_id: topCountry.country_id,
      country_name: countryName,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
      VALUES (@id, @name, @gender, @gender_probability, @sample_size, @age, @age_group, @country_id, @country_name, @country_probability, @created_at)
    `).run(profile);

    return res.status(201).json({ status: "success", data: profile });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

// GET /api/profiles/search — must be BEFORE /api/profiles/:id
app.get("/api/profiles/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q) return res.status(400).json({ status: "error", message: "Missing or empty parameter" });

  const filters = {};

  // Gender
  if (/\bmales?\b/.test(q) && !/\bfemales?\b/.test(q)) filters.gender = "male";
  else if (/\bfemales?\b/.test(q) && !/\bmales?\b/.test(q)) filters.gender = "female";

  // Age group
  if (/\bchildren\b|\bchild\b/.test(q)) filters.age_group = "child";
  else if (/\bteenagers?\b/.test(q)) filters.age_group = "teenager";
  else if (/\badults?\b/.test(q)) filters.age_group = "adult";
  else if (/\bseniors?\b/.test(q)) filters.age_group = "senior";

  // "young" → 16–24
  if (/\byoung\b/.test(q)) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  // "above X" or "over X"
  const aboveMatch = q.match(/\b(?:above|over)\s+(\d+)/);
  if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);

  // "below X" or "under X"
  const belowMatch = q.match(/\b(?:below|under)\s+(\d+)/);
  if (belowMatch) filters.max_age = parseInt(belowMatch[1]);

  // "between X and Y"
  const betweenMatch = q.match(/\bbetween\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1]);
    filters.max_age = parseInt(betweenMatch[2]);
  }

  // Country — check multi-word first, then single
  let countryFound = false;
  const multiWord = ["burkina faso", "south africa", "sierra leone", "ivory coast",
    "cote d'ivoire", "united kingdom", "united states", "cape verde",
    "sao tome", "equatorial guinea", "guinea-bissau"];
  for (const phrase of multiWord) {
    if (q.includes(phrase)) {
      filters.country_id = countryMap[phrase];
      countryFound = true;
      break;
    }
  }
  if (!countryFound) {
    for (const [keyword, code] of Object.entries(countryMap)) {
      if (keyword.split(" ").length === 1 && new RegExp(`\\b${keyword}\\b`).test(q)) {
        filters.country_id = code;
        break;
      }
    }
  }

  // If nothing was parsed at all
  if (Object.keys(filters).length === 0) {
    return res.status(400).json({ status: "error", message: "Unable to interpret query" });
  }

  const { page, limit, sort_by, order } = req.query;
  const { total, data, pageNum, limitNum } = buildProfilesQuery(filters, sort_by, order, page, limit);

  return res.status(200).json({ status: "success", page: pageNum, limit: limitNum, total, data });
});

// GET /api/profiles
app.get("/api/profiles", (req, res) => {
  const { gender, age_group, country_id, min_age, max_age,
    min_gender_probability, min_country_probability,
    sort_by, order, page, limit } = req.query;

  const filters = { gender, age_group, country_id, min_age, max_age,
    min_gender_probability, min_country_probability };

  const { total, data, pageNum, limitNum } = buildProfilesQuery(filters, sort_by, order, page, limit);

  return res.status(200).json({ status: "success", page: pageNum, limit: limitNum, total, data });
});

// GET /api/profiles/:id
app.get("/api/profiles/:id", (req, res) => {
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
  if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
  return res.status(200).json({ status: "success", data: profile });
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", (req, res) => {
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
  if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
  db.prepare("DELETE FROM profiles WHERE id = ?").run(req.params.id);
  return res.sendStatus(204);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));