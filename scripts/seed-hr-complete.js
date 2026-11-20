const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

// CRC32 implementation for PNG generation
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// Generates valid PNG buffer with initials portrait silhouette
function createPortraitPng(width, height, r, g, b, accentR = 255, accentG = 255, accentB = 255) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcVal = crc32(Buffer.concat([t, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, t, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 3;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        // Head silhouette: circle at top
        const headDy = y - height * 0.38;
        const headDist = Math.sqrt(dx * dx + headDy * headDy);
        // Body silhouette: shoulders at bottom
        const bodyDy = y - height * 0.85;
        const bodyDist = Math.sqrt(dx * 0.7 * (dx * 0.7) + bodyDy * bodyDy);

        if (headDist < width * 0.18 || bodyDist < width * 0.35) {
          row[idx] = accentR;
          row[idx + 1] = accentG;
          row[idx + 2] = accentB;
        } else {
          // Background circle gradient
          const factor = 0.85 + (0.3 * y) / height;
          row[idx] = Math.min(255, Math.floor(r * factor));
          row[idx + 1] = Math.min(255, Math.floor(g * factor));
          row[idx + 2] = Math.min(255, Math.floor(b * factor));
        }
      } else {
        // Outer border / background
        row[idx] = 245;
        row[idx + 1] = 247;
        row[idx + 2] = 250;
      }
    }
    scanlines.push(row);
  }

  const idatData = zlib.deflateSync(Buffer.concat(scanlines));
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Generates valid standard PDF buffer with official letterhead formatting
function createOfficialPdf(docTitle, docSubtitle, metadataPairs, bodyParagraphs) {
  const contentStream = [
    'BT',
    '/F1 16 Tf',
    '50 740 Td',
    '(ADT-AI TRAINING FOUNDATION) Tj',
    '/F1 10 Tf',
    '0 -18 Td',
    '(Agricultural Development Trust, Baramati, Maharashtra - 413115) Tj',
    '/F1 8 Tf',
    '0 -14 Td',
    '(Official Human Resources Department - Document Repository) Tj',
    '/F1 14 Tf',
    '0 -32 Td',
    '(' + docTitle.replace(/[\(\)\\\r\n]/g, '') + ') Tj',
    '/F1 10 Tf',
    '0 -20 Td',
    '(' + docSubtitle.replace(/[\(\)\\\r\n]/g, '') + ') Tj',
    '/F1 9 Tf',
    '0 -24 Td',
  ];

  for (const pair of metadataPairs) {
    contentStream.push('(' + pair.replace(/[\(\)\\\r\n]/g, '') + ') Tj');
    contentStream.push('0 -15 Td');
  }

  contentStream.push('0 -15 Td');
  contentStream.push('/F1 9 Tf');

  for (const p of bodyParagraphs) {
    contentStream.push('(' + p.replace(/[\(\)\\\r\n]/g, '') + ') Tj');
    contentStream.push('0 -15 Td');
  }

  contentStream.push('0 -30 Td');
  contentStream.push('/F1 8 Tf');
  contentStream.push('(Verified & Authenticated by HR Department - Digitally Signed) Tj');
  contentStream.push('ET');

  const streamData = contentStream.join('\n');
  const streamLen = Buffer.byteLength(streamData);

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '5 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + streamData + '\nendstream\nendobj',
  ];

  let header = '%PDF-1.4\n';
  let offsets = [];
  let currentOffset = header.length;
  let body = '';
  for (let i = 0; i < objects.length; i++) {
    offsets.push(currentOffset);
    const objStr = objects[i] + '\n';
    body += objStr;
    currentOffset += Buffer.byteLength(objStr);
  }
  const startXref = currentOffset;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 0; i < offsets.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF\n';
  return Buffer.from(header + body + xref + trailer, 'latin1');
}

// Employee portrait color palette definitions
const EMPLOYEE_PALETTES = {
  EMP001: { r: 30, g: 64, b: 175, name: 'Nilesh Nalawade', title: 'Director' }, // Deep Blue
  EMP002: { r: 147, g: 51, b: 234, name: 'Heena Bhatia', title: 'HR Executive' }, // Royal Purple
  EMP003: { r: 16, g: 149, b: 106, name: 'Santosh Deshmukh', title: 'Engineering Manager' }, // Emerald Green
  EMP004: { r: 180, g: 83, b: 9, name: 'Kuldeep Pravin Lakhera', title: 'Lead AI & Architect' }, // Amber Bronze
  EMP005: { r: 225, g: 29, b: 72, name: 'Sanjani Lead', title: 'Product Lead' }, // Rose Crimson
  EMP006: { r: 71, g: 85, b: 105, name: 'Rohit Shinde', title: 'Senior Accountant' }, // Slate Blue
  'ADTAITF/023': { r: 13, g: 148, b: 136, name: 'Samruddhi Ranmode', title: 'AI Trainee' }, // Teal
};

async function seedCompleteHr() {
  console.log('=== STARTING HR COMPLETE SEEDING ===');

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization found');
  console.log(`Target Organization: ${org.name} (${org.id})`);

  // 1. Get or create Default Attendance Policy
  let policy = await prisma.attendancePolicy.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!policy) {
    policy = await prisma.attendancePolicy.create({
      data: {
        organizationId: org.id,
        name: 'Standard 8-Hour Policy',
        code: 'STD-DEFAULT',
        standardWorkMinutes: 480,
        halfDayThresholdMinutes: 240,
        fullDayThresholdMinutes: 420,
        gracePeriodMinutes: 15,
        maxCheckInDelayMinutes: 120,
        timezone: 'Asia/Kolkata',
        geofenceEnforcement: true,
        maxGpsAccuracyMeters: 50000,
        isDefault: true,
      },
    });
  }
  console.log(`Attendance Policy: ${policy.name} (${policy.id})`);

  // 2. Ensure Standard Shift exists
  let shift = await prisma.shift.findFirst({
    where: { organizationId: org.id, code: 'GEN-DAY-01' },
  });
  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        organizationId: org.id,
        policyId: policy.id,
        name: 'General Day Shift (9 AM - 6 PM)',
        code: 'GEN-DAY-01',
        description: 'Standard institutional working shift',
        startTime: '09:00',
        endTime: '18:00',
        isOvernight: false,
        workDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
        breakDurationMinutes: 60,
        color: '#10b981',
        isActive: true,
      },
    });
  }
  console.log(`Standard Shift: ${shift.name} (${shift.id})`);

  // 3. Ensure Office Location exists
  let office = await prisma.officeLocation.findFirst({
    where: { organizationId: org.id },
  });
  if (!office) {
    office = await prisma.officeLocation.create({
      data: {
        organizationId: org.id,
        name: 'ADT AI Baramati',
        code: 'ADT-AI-01',
        latitude: 18.1531,
        longitude: 74.5786,
        radiusMeters: 150,
        address: 'Agricultural Development Trust Campus, Baramati, Maharashtra 413115',
        isActive: true,
      },
    });
  }
  console.log(`Office Location: ${office.name} (${office.id})`);

  // 4. Fetch all employees
  const employees = await prisma.employee.findMany({
    where: { organizationId: org.id, deletedAt: null },
    include: {
      user: true,
      employment: {
        include: {
          department: true,
          designation: true,
          branch: true,
        },
      },
    },
    orderBy: { employeeCode: 'asc' },
  });
  console.log(`Found ${employees.length} employees to configure.`);

  // 5. Assign Shifts & Configure Storage Vault Directory
  const storageRoot =
    process.env.SECURE_DOCUMENT_STORAGE_DIR || path.resolve(process.cwd(), 'storage/documents');
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true });
  }

  // 6. Iterate through each employee
  for (const emp of employees) {
    console.log(`\nProcessing employee [${emp.employeeCode}] ${emp.displayName}...`);

    // 6a. Ensure Shift Assignment
    const existingAssignment = await prisma.shiftAssignment.findFirst({
      where: { employeeId: emp.id, organizationId: org.id },
    });
    if (!existingAssignment) {
      await prisma.shiftAssignment.create({
        data: {
          organizationId: org.id,
          employeeId: emp.id,
          shiftId: shift.id,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }

    // 6b. Profile Photo Generation & Update
    const palette = EMPLOYEE_PALETTES[emp.employeeCode] || {
      r: 30,
      g: 64,
      b: 175,
      name: emp.displayName,
      title: 'Staff',
    };
    const portraitPng = createPortraitPng(128, 128, palette.r, palette.g, palette.b);
    const photoBase64 = `data:image/png;base64,${portraitPng.toString('base64')}`;

    // Update Employee profilePhoto (keep existing if already custom like Kuldeep, unless empty)
    const currentPhoto = emp.profilePhoto || photoBase64;
    await prisma.employee.update({
      where: { id: emp.id },
      data: { profilePhoto: currentPhoto },
    });

    // Update User avatarUrl if linked
    if (emp.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { avatarUrl: emp.user?.avatarUrl || currentPhoto },
      });
    }

    // Ensure employee document storage folder exists
    const empStorageDir = path.resolve(storageRoot, org.id, emp.id);
    if (!fs.existsSync(empStorageDir)) {
      fs.mkdirSync(empStorageDir, { recursive: true });
    }

    // 6c. Seed Full Verified Document Vault
    const standardDocs = [
      {
        documentType: 'PHOTO',
        documentName: 'Official Passport Photograph',
        documentNumber: `PHOTO-${emp.employeeCode}`,
        mimeType: 'image/png',
        fileBuffer: portraitPng,
        isPhoto: true,
      },
      {
        documentType: 'APPOINTMENT_LETTER',
        documentName: 'Official Appointment Letter & Contract',
        documentNumber: `ADT-AITF/APP/${emp.employeeCode}`,
        mimeType: 'application/pdf',
        fileBuffer: createOfficialPdf(
          'LETTER OF APPOINTMENT & EMPLOYMENT CONTRACT',
          `Reference ID: ADT-AITF/APP/${emp.employeeCode}`,
          [
            `Employee Name: ${emp.displayName}`,
            `Employee Code: ${emp.employeeCode}`,
            `Designation: ${emp.employment?.designation?.title || palette.title}`,
            `Department: ${emp.employment?.department?.name || 'Engineering & Product'}`,
            `Branch / Location: ADT AI Baramati Campus`,
            `Date of Appointment: 01 November 2026`,
          ],
          [
            'This document confirms formal appointment at ADT-AI Training Foundation.',
            'The employee shall adhere strictly to organizational policies, confidentiality standards,',
            'and professional code of conduct of Agricultural Development Trust (ADT).',
          ],
        ),
      },
      {
        documentType: 'GOVT_ID',
        documentName: 'Aadhaar Card / National Identity Verification',
        documentNumber: `AADHAAR-XXXX-${emp.employeeCode.slice(-4).padStart(4, '0')}`,
        mimeType: 'application/pdf',
        fileBuffer: createOfficialPdf(
          'GOVERNMENT IDENTITY VERIFICATION RECORD',
          `UIDAI Aadhaar Card Electronic Verification`,
          [
            `Full Legal Name: ${emp.displayName}`,
            `Document Type: National Aadhaar Identity Card`,
            `Verification Status: Authenticated via UIDAI Portal`,
            `Employee Code: ${emp.employeeCode}`,
            `Date of Verification: 02 November 2026`,
          ],
          [
            'This record confirms the employee has submitted verified government identification.',
            'All biometric and demographic records have been matched against official databases.',
          ],
        ),
      },
      {
        documentType: 'EDUCATION',
        documentName: 'Degree Certificate & Academic Records',
        documentNumber: `DEG-BTECH-${emp.employeeCode}`,
        mimeType: 'application/pdf',
        fileBuffer: createOfficialPdf(
          'DEGREE & ACADEMIC CREDENTIAL VERIFICATION',
          'Higher Educational Qualification Verification Certificate',
          [
            `Candidate Name: ${emp.displayName}`,
            `Degree Awarded: Bachelor / Master of Technology / Advanced Degree`,
            `Institute / University: Savitribai Phule Pune University / Accredited University`,
            `Year of Graduation: 2022-2025`,
            `Verification Status: Transcripts & Degrees Authenticated by HR`,
          ],
          [
            'Academic transcripts and degree certifications have been thoroughly vetted.',
            'Qualifications meet the requisite benchmarks for employment at ADT-AI Training Foundation.',
          ],
        ),
      },
      {
        documentType: 'COMPLIANCE',
        documentName: 'Non-Disclosure & Confidentiality Agreement (NDA)',
        documentNumber: `NDA-2026-${emp.employeeCode}`,
        mimeType: 'application/pdf',
        fileBuffer: createOfficialPdf(
          'MUTUAL NON-DISCLOSURE & CONFIDENTIALITY AGREEMENT',
          `Contract Reference: ADT-NDA-2026-${emp.employeeCode}`,
          [
            `Party of the First Part: ADT-AI Training Foundation`,
            `Party of the Second Part: ${emp.displayName}`,
            `Execution Date: 01 November 2026`,
            `Scope: Artificial Intelligence Models, Proprietary Datasets, Training Compute`,
          ],
          [
            'The employee covenants to hold in strictest confidence all institutional data, research findings,',
            'HPC cluster credentials, algorithmic weights, and private intellectual property of ADT.',
            'Violation of this agreement carries legal and disciplinary remedies under Indian law.',
          ],
        ),
      },
      {
        documentType: 'EXPERIENCE',
        documentName: 'Previous Experience & Relieving Certificate',
        documentNumber: `EXP-REL-${emp.employeeCode}`,
        mimeType: 'application/pdf',
        fileBuffer: createOfficialPdf(
          'PRIOR EXPERIENCE & RELIEVING CERTIFICATE',
          `Reference ID: EXP-${emp.employeeCode}`,
          [
            `Employee Name: ${emp.displayName}`,
            `Prior Service Verified: Yes`,
            `Clearance Status: Relieved in Good Standing`,
            `Verification Mode: Official Background Verification (BGV) Completed`,
          ],
          [
            'All prior employment records, relieving letters, and service testimonials have been verified.',
            'No dues or encumbrances pending from previous institutional affiliations.',
          ],
        ),
      },
    ];

    for (const doc of standardDocs) {
      let existingDoc = await prisma.employeeDocumentMetadata.findFirst({
        where: {
          employeeId: emp.id,
          documentType: doc.documentType,
        },
      });

      const docId = existingDoc ? existingDoc.id : crypto.randomUUID();
      const binFilePath = path.resolve(empStorageDir, `${docId}.bin`);

      // Write physical file to storage
      fs.writeFileSync(binFilePath, doc.fileBuffer);

      if (existingDoc) {
        await prisma.employeeDocumentMetadata.update({
          where: { id: existingDoc.id },
          data: {
            documentName: doc.documentName,
            documentNumber: doc.documentNumber,
            mimeType: doc.mimeType,
            fileSize: doc.fileBuffer.length,
            fileUrl: `${org.id}/${emp.id}/${docId}.bin`,
            isVerified: true,
            verifiedAt: new Date('2026-11-02T10:00:00.000Z'),
            verifiedById: emp.userId,
          },
        });
      } else {
        await prisma.employeeDocumentMetadata.create({
          data: {
            id: docId,
            employeeId: emp.id,
            documentType: doc.documentType,
            documentName: doc.documentName,
            documentNumber: doc.documentNumber,
            mimeType: doc.mimeType,
            fileSize: doc.fileBuffer.length,
            fileUrl: `${org.id}/${emp.id}/${docId}.bin`,
            issueDate: new Date('2026-11-01T00:00:00.000Z'),
            expiryDate: doc.documentType === 'PHOTO' ? null : new Date('2036-11-01T00:00:00.000Z'),
            isVerified: true,
            verifiedAt: new Date('2026-11-02T10:00:00.000Z'),
            verifiedById: emp.userId,
          },
        });
      }
    }
    console.log(`  -> Configured 6 verified documents + photo binary for ${emp.displayName}`);

    // 6d. Seed Comprehensive 30-Day Attendance Records
    console.log(`  -> Seeding past 30 days attendance records...`);
    const today = new Date('2026-11-20T12:00:00.000Z');
    let seededDays = 0;

    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const targetDate = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = targetDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

      // Skip Sunday (weekly off)
      if (dayOfWeek === 0) continue;

      const yyyy = targetDate.getUTCFullYear();
      const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getUTCDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const midnightUtc = new Date(`${dateStr}T00:00:00.000Z`);

      // Seed pseudo-random realistic variations
      // Check-in around 09:10 - 09:28 AM IST (+05:30 -> 03:40 - 03:58 UTC)
      const checkInMinute = 10 + Math.floor(Math.random() * 18);
      const checkInUtc = new Date(
        `${dateStr}T03:${String(40 + Math.floor(checkInMinute / 2)).padStart(2, '0')}:00.000Z`,
      );

      // Check-out around 18:10 - 18:40 PM IST (+05:30 -> 12:40 - 13:10 UTC)
      const checkOutMinute = 10 + Math.floor(Math.random() * 30);
      const checkOutUtc = new Date(
        `${dateStr}T12:${String(40 + Math.floor(checkOutMinute / 2)).padStart(2, '0')}:00.000Z`,
      );

      const totalWorkMinutes = 510 + Math.floor(Math.random() * 30); // 8.5h to 9h
      const totalBreakMinutes = 45 + Math.floor(Math.random() * 15);
      const lateMinutes = checkInMinute > 25 ? checkInMinute - 15 : 0;
      const overtimeMinutes = totalWorkMinutes > 520 ? totalWorkMinutes - 520 : 0;

      // Upsert AttendanceDailySummary
      const existingSummary = await prisma.attendanceDailySummary.findFirst({
        where: {
          employeeId: emp.id,
          date: midnightUtc,
        },
      });

      if (existingSummary) {
        await prisma.attendanceDailySummary.update({
          where: { id: existingSummary.id },
          data: {
            firstCheckIn: checkInUtc,
            lastCheckOut: checkOutUtc,
            totalWorkMinutes,
            totalBreakMinutes,
            lateMinutes,
            overtimeMinutes,
            status: 'PRESENT',
            shiftId: shift.id,
            policyId: policy.id,
            primaryAttendanceMode: 'OFFICE',
          },
        });
      } else {
        await prisma.attendanceDailySummary.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            date: midnightUtc,
            firstCheckIn: checkInUtc,
            lastCheckOut: checkOutUtc,
            totalWorkMinutes,
            totalBreakMinutes,
            lateMinutes,
            earlyExitMinutes: 0,
            overtimeMinutes,
            status: 'PRESENT',
            shiftId: shift.id,
            policyId: policy.id,
            primaryAttendanceMode: 'OFFICE',
          },
        });
      }

      // Upsert AttendanceSession
      let session = await prisma.attendanceSession.findFirst({
        where: {
          employeeId: emp.id,
          date: midnightUtc,
          sessionNumber: 1,
        },
      });

      if (session) {
        await prisma.attendanceSession.update({
          where: { id: session.id },
          data: {
            checkInTime: checkInUtc,
            checkOutTime: checkOutUtc,
            totalWorkMinutes,
            totalBreakMinutes,
            status: 'COMPLETED',
            attendanceMode: 'OFFICE',
          },
        });
      } else {
        session = await prisma.attendanceSession.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            date: midnightUtc,
            sessionNumber: 1,
            checkInTime: checkInUtc,
            checkOutTime: checkOutUtc,
            totalWorkMinutes,
            totalBreakMinutes,
            status: 'COMPLETED',
            attendanceMode: 'OFFICE',
          },
        });
      }

      // Upsert AttendanceEvents (CHECK_IN & CHECK_OUT)
      const inKey = `EVT-IN-${emp.employeeCode}-${dateStr}`;
      const outKey = `EVT-OUT-${emp.employeeCode}-${dateStr}`;

      const existingIn = await prisma.attendanceEvent.findUnique({
        where: { idempotencyKey: inKey },
      });
      if (!existingIn) {
        await prisma.attendanceEvent.create({
          data: {
            idempotencyKey: inKey,
            organizationId: org.id,
            employeeId: emp.id,
            sessionId: session.id,
            eventType: 'CHECK_IN',
            eventTimestamp: checkInUtc,
            attendanceMode: 'OFFICE',
            latitude: 18.1531,
            longitude: 74.5786,
            accuracyMeters: 12.0,
            branchId: emp.employment?.branchId,
            officeLocationId: office.id,
            distanceFromOfficeMeters: 8.5,
            geofenceStatus: 'VERIFIED',
            actorUserId: emp.userId || 'system',
            deviceInfo: 'ADT Institutional Portal / Verified Browser',
          },
        });
      }

      const existingOut = await prisma.attendanceEvent.findUnique({
        where: { idempotencyKey: outKey },
      });
      if (!existingOut) {
        await prisma.attendanceEvent.create({
          data: {
            idempotencyKey: outKey,
            organizationId: org.id,
            employeeId: emp.id,
            sessionId: session.id,
            eventType: 'CHECK_OUT',
            eventTimestamp: checkOutUtc,
            attendanceMode: 'OFFICE',
            latitude: 18.1531,
            longitude: 74.5786,
            accuracyMeters: 10.0,
            branchId: emp.employment?.branchId,
            officeLocationId: office.id,
            distanceFromOfficeMeters: 9.2,
            geofenceStatus: 'VERIFIED',
            actorUserId: emp.userId || 'system',
            deviceInfo: 'ADT Institutional Portal / Verified Browser',
          },
        });
      }

      seededDays++;
    }
    console.log(
      `  -> Successfully seeded ${seededDays} attendance working days for ${emp.displayName}`,
    );
  }

  console.log('\n=== HR SEEDING COMPLETED SUCCESSFULLY ===');
}

seedCompleteHr()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Seeding failed:', e);
    return prisma.$disconnect();
  });
