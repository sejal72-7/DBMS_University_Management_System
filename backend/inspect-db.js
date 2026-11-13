const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function inspect() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'university_management_db';

  console.log('Connecting to MySQL Server at %s:%d as user "%s"...', host, port, user);
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });
  } catch (err) {
    console.error('Failed to connect to MySQL:', err.message, '(' + err.code + ')');
    process.exit(1);
  }

  const [versionRows] = await connection.query('SELECT VERSION() AS ver');
  console.log('Connected successfully! MySQL Server Version:', versionRows[0].ver);

  const [dbRows] = await connection.query('SHOW DATABASES LIKE ?', [dbName]);
  if (dbRows.length === 0) {
    console.log('Database "%s" does NOT exist yet.', dbName);
    await connection.end();
    return;
  }

  console.log('Database "%s" EXISTS.', dbName);
  await connection.changeUser({ database: dbName });

  const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  console.log('Base Tables found (%d):', tables.length);
  for (const t of tables) {
    const tableName = Object.values(t)[0];
    const [countRows] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
    console.log('  - Table: %s (Rows: %d)', tableName, countRows[0].cnt);
  }

  const [views] = await connection.query('SHOW FULL TABLES WHERE Table_type = "VIEW"');
  console.log('Views found (%d):', views.length);
  for (const v of views) {
    console.log('  - View: %s', Object.values(v)[0]);
  }

  const [procs] = await connection.query(
    'SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = "PROCEDURE"',
    [dbName]
  );
  console.log('Procedures found (%d):', procs.length);
  for (const p of procs) {
    console.log('  - Procedure: %s', p.ROUTINE_NAME);
  }

  const [triggers] = await connection.query(
    'SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
    [dbName]
  );
  console.log('Triggers found (%d):', triggers.length);
  for (const tr of triggers) {
    console.log('  - Trigger: %s on %s (%s)', tr.TRIGGER_NAME, tr.EVENT_OBJECT_TABLE, tr.EVENT_MANIPULATION);
  }

  await connection.end();
}

inspect();

