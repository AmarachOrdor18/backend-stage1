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

// POST /api/profiles
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ status: "error", message: "Missing or empty name" });
  }

  if (typeof name !== "string") {
    return res.status(422).json({ status: "error", message: "Invalid type" });
  }

  const cleanName = name.trim().toLowerCase();

  // Check if profile already exists
  const existing = db.prepare("SELECT * FROM profiles WHERE name = ?").get(cleanName);
  if (existing) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: existing,
    });
  }

  // Call all 3 external APIs
  try {
    const [genderRes, agifyRes, nationalizeRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${cleanName}`),
      fetch(`https://api.agify.io?name=${cleanName}`),
      fetch(`https://api.nationalize.io?name=${cleanName}`),
    ]);

    const [genderData, agifyData, nationalizeData] = await Promise.all([
      genderRes.json(),
      agifyRes.json(),
      nationalizeRes.json(),
    ]);

    // Validate Genderize
    if (!genderData.gender || genderData.count === 0) {
      return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
    }

    // Validate Agify
    if (agifyData.age === null || agifyData.age === undefined) {
      return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
    }

    // Validate Nationalize
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
    }

    // Pick top country
    const topCountry = nationalizeData.country.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const profile = {
      id: uuidv7(),
      name: cleanName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: agifyData.age,
      age_group: getAgeGroup(agifyData.age),
      country_id: topCountry.country_id,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
      VALUES (@id, @name, @gender, @gender_probability, @sample_size, @age, @age_group, @country_id, @country_probability, @created_at)
    `).run(profile);

    return res.status(201).json({ status: "success", data: profile });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

// GET /api/profiles
app.get("/api/profiles", (req, res) => {
  let query = "SELECT * FROM profiles WHERE 1=1";
  const params = [];

  if (req.query.gender) {
    query += " AND LOWER(gender) = ?";
    params.push(req.query.gender.toLowerCase());
  }
  if (req.query.country_id) {
    query += " AND LOWER(country_id) = ?";
    params.push(req.query.country_id.toLowerCase());
  }
  if (req.query.age_group) {
    query += " AND LOWER(age_group) = ?";
    params.push(req.query.age_group.toLowerCase());
  }

  const profiles = db.prepare(query).all(...params);

  return res.status(200).json({
    status: "success",
    count: profiles.length,
    data: profiles,
  });
});

// GET /api/profiles/:id
app.get("/api/profiles/:id", (req, res) => {
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
  if (!profile) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }
  return res.status(200).json({ status: "success", data: profile });
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", (req, res) => {
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
  if (!profile) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }
  db.prepare("DELETE FROM profiles WHERE id = ?").run(req.params.id);
  return res.sendStatus(204);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));