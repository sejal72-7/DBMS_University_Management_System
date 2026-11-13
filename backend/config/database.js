const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

// Load .env from project root first, then fallback to backend/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'university_management_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  connectTimeout: 5000,
  dateStrings: true
});

/**
 * Execute a parameterized SQL query using prepared statements.
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Execute a callback inside an explicit MySQL transaction with automatic rollback on error.
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback failures when original error already occurred
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Verify MySQL connectivity and diagnose common setup errors.
 */
async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();

    let version = 'unknown';
    let database = process.env.DB_NAME || 'university_management_db';
    let tables = [];

    try {
      const [ver] = await connection.query('SELECT VERSION() AS version');
      if (ver && ver[0] && ver[0].version) version = ver[0].version;
      const [db] = await connection.query('SELECT DATABASE() AS current_database');
      if (db && db[0] && db[0].current_database) database = db[0].current_database;
      const [tbls] = await connection.query('SHOW TABLES');
      if (tbls && Array.isArray(tbls)) tables = tbls.map(r => Object.values(r)[0]);
    } catch (_) {
      // Fallback if running under unit-test mock
    }

    return {
      success: true,
      version,
      database,
      tables
    };
  } catch (err) {
    let diagnosis = 'Unknown database error.';
    if (err.code === 'ECONNREFUSED') {
      diagnosis = `MySQL Server is not running or unreachable on port ${process.env.DB_PORT || 3306}.`;
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      diagnosis = `Access denied for user "${process.env.DB_USER || 'root'}". Check DB_PASSWORD in .env.`;
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      diagnosis = `Database "${process.env.DB_NAME || 'university_management_db'}" does not exist. Run database/schema.sql to create it.`;
    } else if (err.code === 'ENOTFOUND') {
      diagnosis = `Host "${process.env.DB_HOST || 'localhost'}" could not be resolved.`;
    }
    err.diagnosis = diagnosis;
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  testConnection
};
