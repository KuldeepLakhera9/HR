const http = require('http');

async function login(email, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email, password });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data.data?.tokens?.accessToken || data.data?.accessToken);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1${path}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Logging in as Heena Bhatia (HR Executive)...');
  const hrToken = await login('heena.bhatia@vpspcoe-ai.org', 'Password@123');
  console.log('HR Token received:', hrToken ? 'YES' : 'NO');

  console.log('\n--- 1. Testing GET /documents/organization ---');
  const orgDocs = await get('/documents/organization', hrToken);
  console.log('Status:', orgDocs.status);
  console.log('Items Count:', orgDocs.data?.data?.items?.length);
  console.log('Stats:', orgDocs.data?.data?.stats);
  console.log(
    'Employees:',
    orgDocs.data?.data?.employees?.map((e) => e.displayName),
  );
  if (orgDocs.data?.data?.items?.length) {
    console.log(
      'First 3 sample items:',
      orgDocs.data.data.items.slice(0, 3).map((d) => ({
        emp: d.employee?.displayName,
        doc: d.documentName,
        type: d.documentType,
        verified: d.isVerified,
      })),
    );
  }

  console.log('\n--- 2. Testing GET /reports/attendance/daily ---');
  const attDaily = await get(
    '/reports/attendance/daily?startDate=2026-11-01&endDate=2026-11-20',
    hrToken,
  );
  console.log('Status:', attDaily.status);
  console.log(
    'Total records:',
    attDaily.data?.data?.meta?.total ||
      attDaily.data?.data?.records?.length ||
      attDaily.data?.data?.length,
  );

  console.log('\n--- 3. Testing GET /reports/workforce/headcount ---');
  const wf = await get('/reports/workforce/headcount', hrToken);
  console.log('Status:', wf.status);
  console.log('Headcount:', wf.data?.data?.activeHeadcount);

  console.log('\n--- 4. Testing GET /reports/executive/dashboard ---');
  const exec = await get('/reports/executive/dashboard', hrToken);
  console.log('Status:', exec.status);
  console.log('Summary metrics:', {
    totalHeadcount: exec.data?.data?.summary?.totalHeadcount,
    attendanceRate: exec.data?.data?.summary?.attendanceRate,
    avgWorkingHours: exec.data?.data?.summary?.avgWorkingHours,
    activeHeadcount: exec.data?.data?.summary?.activeHeadcount,
    deptBreakdown: exec.data?.data?.departmentBreakdown?.map((d) => ({
      name: d.departmentName,
      count: d.headcount,
    })),
    attendanceDays: exec.data?.data?.attendanceTrend?.length,
  });

  console.log('\nAll API checks completed successfully!');
}

main().catch(console.error);
