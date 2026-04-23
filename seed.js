const { v7: uuidv7 } = require("uuid");
const db = require("./database");
const fs = require("fs");

const raw = fs.readFileSync("./seed.json", "utf-8");
const { profiles } = JSON.parse(raw);

const insert = db.prepare(`
  INSERT OR IGNORE INTO profiles 
  (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
  VALUES (@id, @name, @gender, @gender_probability, @sample_size, @age, @age_group, @country_id, @country_name, @country_probability, @created_at)
`);

const insertMany = db.transaction((profiles) => {
  for (const p of profiles) {
    insert.run({
      id: uuidv7(),
      name: p.name,
      gender: p.gender,
      gender_probability: p.gender_probability,
      sample_size: null,
      age: p.age,
      age_group: p.age_group,
      country_id: p.country_id,
      country_name: p.country_name,
      country_probability: p.country_probability,
      created_at: new Date().toISOString(),
    });
  }
});

insertMany(profiles);
console.log(`Seeded ${profiles.length} profiles.`);