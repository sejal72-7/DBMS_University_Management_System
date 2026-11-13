const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const EXPECTED_TABLES = [
  'attendance',
  'departments',
  'examinations',
  'faculty',
  'results',
  'students',
  'users'
];

async function testDatabaseConnectivity() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'university_management_db';

  console.log('============================================================');
  console.log('      University Management System - MySQL Connection Test  ');
  console.log('============================================================');
  console.log('Target Configuration:');
  console.log(`  Host:     ${host}`);
  console.log(`  Port:     ${port}`);
  console.log(`  User:     ${user}`);
  console.log(`  Database: ${database}`);
  console.log('------------------------------------------------------------');

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: 5000
    });
  } catch (err) {
    console.error('\n[FAILED] MySQL Connection Error:');
    console.error(`  Code:    ${err.code || 'UNKNOWN'}`);
    console.error(`  Message: ${err.message}\n`);
    console.error('Diagnosis & Troubleshooting:');

    if (err.code === 'ECONNREFUSED') {
      console.error('  -> CAUSE: MySQL Server is not running or incorrect port.');
      console.error(`     Resolution: Ensure MySQL Windows Service (e.g., MySQL80) is started and listening on port ${port}.`);
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  -> CAUSE: Incorrect password or username.');
      console.error(`     Resolution: Verify the DB_USER ("${user}") and DB_PASSWORD set in .env match your local MySQL Server.`);
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('  -> CAUSE: Missing database.');
      console.error(`     Resolution: The database "${database}" does not exist. Run "schema.sql" to create it.`);
    } else if (err.code === 'ENOTFOUND') {
      console.error('  -> CAUSE: Incorrect database host.');
      console.error(`     Resolution: Host "${host}" could not be resolved. Ensure DB_HOST is set to "localhost" or "127.0.0.1".`);
    } else {
      console.error('  -> CAUSE: Incorrect database configuration or network timeout.');
      console.error(`     Resolution: Review your .env configuration file and verify MySQL server connectivity.`);
    }
    console.log('============================================================\n');
    process.exit(1);
  }

  try {
    // 1. Query: SELECT VERSION()
    const [versionRows] = await connection.query('SELECT VERSION() AS version');
    const version = versionRows[0].version;

    // 2. Query: SELECT DATABASE()
    const [dbRows] = await connection.query('SELECT DATABASE() AS current_database');
    const currentDb = dbRows[0].current_database;

    // 3. Query: SHOW TABLES
    const [tableRows] = await connection.query('SHOW TABLES');
    const tables = tableRows.map(row => Object.values(row)[0]);

    console.log('\n[SUCCESS] Connected to local MySQL Server successfully!');
    console.log(`  Server Version:   ${version}`);
    console.log(`  Current Database: ${currentDb}`);
    console.log(`  Total Tables:     ${tables.length}`);
    console.log(`  Tables List:      ${tables.join(', ')}`);

    // Verify expected tables
    const missingTables = EXPECTED_TABLES.filter(t => !tables.includes(t));
    if (missingTables.length > 0) {
      console.warn(`\n[WARNING] Some expected tables are missing: ${missingTables.join(', ')}`);
      console.warn('  Resolution: Execute database/schema.sql to recreate missing tables.');
    } else {
      console.log('\n[VERIFIED] All 7 core tables are present:');
      for (const t of tables) {
        const [cnt] = await connection.query(`SELECT COUNT(*) AS total FROM \`${t}\``);
        console.log(`    - ${t.padEnd(15)} : ${cnt[0].total} records`);
      }
    }

    console.log('============================================================\n');
  } catch (err) {
    console.error('Error executing verification queries:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  testDatabaseConnectivity();
}

module.exports = { testDatabaseConnectivity };

