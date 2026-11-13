const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { app } = require('./server');

function makeRequest(server, path, { method = 'GET', body = null, cookie = '' } = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = {};
    let payload = null;

    if (body !== null) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          const setCookie = res.headers['set-cookie'];
          const nextCookie = setCookie ? setCookie[0].split(';')[0] : cookie;
          resolve({ status: res.statusCode, headers: res.headers, text: raw, json, cookie: nextCookie });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function verifyAll() {
  console.log('================================================================');
  console.log(' LIVE VERIFICATION: University Management System & Local MySQL  ');
  console.log('================================================================\n');

  // 1. Direct MySQL Connection & Table Verification
  console.log('[1/8] Verifying Direct MySQL Connection & 7 Core Tables...');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'university_management_db'
  });

  const [ver] = await pool.query('SELECT VERSION() AS v');
  const [db] = await pool.query('SELECT DATABASE() AS d');
  console.log(`  -> Connected to MySQL v${ver[0].v}, Database: ${db[0].d}`);

  const coreTables = ['users', 'departments', 'faculty', 'students', 'attendance', 'examinations', 'results'];
  for (const table of coreTables) {
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    console.log(`  -> Table [${table.padEnd(12)}]: ${rows[0].total} records found.`);
    if (rows[0].total === 0) {
      throw new Error(`Table ${table} has 0 records! Sample data missing.`);
    }
  }

  // 2. Start Live Express Server for API Testing
  console.log('\n[2/8] Starting live HTTP server test instance...');
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  console.log(`  -> Server listening on port ${server.address().port}`);

  try {
    // 3. Test Health Endpoint
    console.log('\n[3/8] Testing /api/health endpoint...');
    const health = await makeRequest(server, '/api/health');
    console.log(`  -> Status: ${health.status}, Response:`, health.json);
    if (health.status !== 200 || health.json.database !== 'connected') {
      throw new Error('/api/health failed to report connected status');
    }

    // 4. Test Authentication (Admin, Faculty, Student)
    console.log('\n[4/8] Testing Role Logins against Local MySQL Database...');

    // Admin login
    const adminLogin = await makeRequest(server, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@university.edu', password: 'Admin@123', role: 'admin' }
    });
    console.log(`  -> Admin Login: HTTP ${adminLogin.status}, User: ${adminLogin.json.user.full_name} (${adminLogin.json.user.role})`);
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminCookie = adminLogin.cookie;

    // Faculty login
    const facultyLogin = await makeRequest(server, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'faculty1@university.edu', password: 'Faculty@123', role: 'faculty' }
    });
    console.log(`  -> Faculty Login: HTTP ${facultyLogin.status}, User: ${facultyLogin.json.user.full_name} (${facultyLogin.json.user.role})`);
    if (facultyLogin.status !== 200) throw new Error('Faculty login failed');
    const facultyCookie = facultyLogin.cookie;

    // Student login
    const studentLogin = await makeRequest(server, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'student1@university.edu', password: 'Student@123', role: 'student' }
    });
    console.log(`  -> Student Login: HTTP ${studentLogin.status}, User: ${studentLogin.json.user.full_name} (${studentLogin.json.user.role})`);
    if (studentLogin.status !== 200) throw new Error('Student login failed');
    const studentCookie = studentLogin.cookie;

    // 5. Test Dashboards
    console.log('\n[5/8] Verifying Role Dashboards (MySQL Aggregations)...');
    const adminDash = await makeRequest(server, '/api/dashboard', { cookie: adminCookie });
    console.log(`  -> Admin Dashboard: HTTP ${adminDash.status}, Students: ${adminDash.json.data.summary.totalStudents}, Faculty: ${adminDash.json.data.summary.totalFaculty}, Depts: ${adminDash.json.data.summary.totalDepartments}`);

    const facultyDash = await makeRequest(server, '/api/dashboard', { cookie: facultyCookie });
    console.log(`  -> Faculty Dashboard: HTTP ${facultyDash.status}, Faculty: ${facultyDash.json.data.faculty.full_name}, Dept: ${facultyDash.json.data.faculty.department_name}`);

    const studentDash = await makeRequest(server, '/api/dashboard', { cookie: studentCookie });
    console.log(`  -> Student Dashboard: HTTP ${studentDash.status}, Student: ${studentDash.json.data.student.full_name}, Attendance: ${studentDash.json.data.attendanceSummary.attendance_percentage}%`);

    // 6. Test Core Modules (Departments, Faculty, Students CRUD)
    console.log('\n[6/8] Verifying Management Modules (CRUD on Local MySQL)...');
    
    // Departments
    const depts = await makeRequest(server, '/api/departments', { cookie: adminCookie });
    console.log(`  -> Departments list: HTTP ${depts.status}, Count: ${depts.json.data.length}`);

    // Faculty list
    const facultyList = await makeRequest(server, '/api/faculty', { cookie: adminCookie });
    console.log(`  -> Faculty directory: HTTP ${facultyList.status}, Count: ${facultyList.json.data.length}`);

    // Student CRUD
    const studentList = await makeRequest(server, '/api/students', { cookie: adminCookie });
    console.log(`  -> Students list: HTTP ${studentList.status}, Total in DB: ${studentList.json.data.length}`);

    // Create a temporary student to test INSERT with foreign keys
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const newStudentData = {
      username: 'temp_verify_' + randSuffix,
      email: 'temp_' + randSuffix + '@university.edu',
      full_name: 'Verification Student ' + randSuffix,
      password: 'Student@123',
      registration_number: 'REG_TEST_' + randSuffix,
      phone: '9998887776',
      department_id: depts.json.data[0].department_id,
      semester: 1,
      admission_year: 2026
    };

    const createStudent = await makeRequest(server, '/api/students', {
      method: 'POST',
      body: newStudentData,
      cookie: adminCookie
    });
    console.log(`  -> Student Creation (INSERT): HTTP ${createStudent.status}, Student ID: ${createStudent.json.data.student_id}`);
    if (createStudent.status !== 201) throw new Error('Student insertion failed');

    // Clean up temporary student
    const deleteStudent = await makeRequest(server, `/api/students/${createStudent.json.data.student_id}`, {
      method: 'DELETE',
      cookie: adminCookie
    });
    console.log(`  -> Student Deletion (DELETE / Clean up): HTTP ${deleteStudent.status}`);

    // 7. Attendance & Examination Management
    console.log('\n[7/8] Verifying Attendance & Examination Modules...');
    const attendanceSession = await makeRequest(
      server,
      `/api/attendance/session?department_id=${depts.json.data[0].department_id}&semester=4&attendance_date=2026-03-20&session_name=Morning`,
      { cookie: facultyCookie }
    );
    console.log(`  -> Attendance Session Roster: HTTP ${attendanceSession.status}, Students in roster: ${attendanceSession.json.data.length}`);

    const exams = await makeRequest(server, '/api/examinations', { cookie: facultyCookie });
    console.log(`  -> Examinations: HTTP ${exams.status}, Total exams: ${exams.json.data.length}`);

    const studentResults = await makeRequest(server, '/api/results/my', { cookie: studentCookie });
    console.log(`  -> Student Results: HTTP ${studentResults.status}, Evaluated subjects: ${studentResults.json.data.subjects.length}, Overall: ${studentResults.json.data.summary.overallPercentage}% (${studentResults.json.data.summary.overallStatus})`);

    // 8. Test DBMS Concepts live queries (Views, Procedures, Triggers, Transactions)
    console.log('\n[8/8] Verifying DBMS Concepts (11 live queries, Views, Stored Procedures, Triggers)...');
    const dbmsConcepts = await makeRequest(server, '/api/dbms-concepts', { cookie: adminCookie });
    console.log(`  -> Concepts list: HTTP ${dbmsConcepts.status}, Total concepts: ${dbmsConcepts.json.data.length}`);

    for (const concept of dbmsConcepts.json.data) {
      const conceptTest = await makeRequest(server, `/api/dbms-concepts/${concept.id}`, {
        method: 'GET',
        cookie: adminCookie
      });
      console.log(`  -> Concept #${concept.number} [${concept.title}]: HTTP ${conceptTest.status}, Rows returned: ${conceptTest.json.data.rowCount}, Latency: ${conceptTest.json.data.executionTimeMs}ms`);
      if (conceptTest.status !== 200) throw new Error(`Concept ${concept.id} execution failed`);
    }

    console.log('\n================================================================');
    console.log(' ALL 8 VERIFICATION PHASES PASSED WITH 100% SUCCESS!           ');
    console.log(' Local MySQL Server is fully configured, connected & operating. ');
    console.log('================================================================\n');
    process.exit(0);
  } finally {
    if (server) server.close();
    if (pool) await pool.end();
  }
}

verifyAll().catch(err => {
  console.error('\n[VERIFICATION FAILED]:', err);
  process.exit(1);
});
