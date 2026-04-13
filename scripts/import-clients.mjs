import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

config({ path: path.join(root, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before importing.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const csvPath = path.join(root, "data", "Master_Clients_Import.csv");
const raw = readFileSync(csvPath, "utf8");

const rows = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

const records = rows.map((row) => ({
  business_name: row["Business Name"]?.trim() || "",
  team_member: emptyToNull(row["Team Member"]),
  monthly_hours: parseHours(row["Monthly Hours"]),
  service_tier: emptyToNull(row["Service Tier"]),
  services: emptyToNull(row["Services"]),
  website: emptyToNull(row["Website"]),
  location: emptyToNull(row["Location"]),
  primary_contact: emptyToNull(row["Primary Contact"]),
  client_vibe_notes: emptyToNull(row["Client Vibe/Notes"]),
  account_group: emptyToNull(row["Account Group"]),
}));

const invalid = records.filter((r) => !r.business_name);
if (invalid.length) {
  console.error("Some rows are missing Business Name:", invalid.length);
  process.exit(1);
}

const { error: delError } = await supabase
  .from("clients")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");

if (delError) {
  console.error("Could not clear clients table:", delError.message);
  process.exit(1);
}

const batchSize = 50;
for (let i = 0; i < records.length; i += batchSize) {
  const chunk = records.slice(i, i + batchSize);
  const { error } = await supabase.from("clients").insert(chunk);
  if (error) {
    console.error("Insert failed at offset", i, error.message);
    process.exit(1);
  }
}

console.log(`Imported ${records.length} clients from Master_Clients_Import.csv`);

function emptyToNull(v) {
  const s = v?.trim();
  return s ? s : null;
}

function parseHours(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
