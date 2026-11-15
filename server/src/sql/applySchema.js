import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, 'schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

try {
  await pool.query(sql);
  const table = await pool.query(
    `SELECT to_regclass('public.link_clicks') AS link_clicks`
  );
  const column = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'links'
       AND column_name IN ('unique_click_count', 'safety_verdict', 'expires_at')`
  );
  const present = new Set(column.rows.map((row) => row.column_name));
  console.log('Schema applied OK');
  console.log('link_clicks:', table.rows[0].link_clicks);
  console.log(
    'unique_click_count:',
    present.has('unique_click_count') ? 'present' : 'missing'
  );
  console.log(
    'safety_verdict:',
    present.has('safety_verdict') ? 'present' : 'missing'
  );
  console.log('expires_at:', present.has('expires_at') ? 'present' : 'missing');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
