import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface GeneratePayslipPdfData {
  snapshot: {
    payslipNumber: string;
    employeeCode: string;
    employeeName: string;
    departmentName?: string | null;
    designationTitle?: string | null;
    branchName?: string | null;
    bankName?: string | null;
    bankAccountMasked?: string | null;
    panMasked?: string | null;
    pfUan?: string | null;
    calendarDays: number;
    workingDays: number;
    paidDays: number;
    lopDays: number;
    baseMonthlyGross: number;
    earnedGross: number;
    totalDeductions: number;
    netSalary: number;
    roundingAdjustment: number;
    currency: string;
    paymentMethod?: string | null;
    publishedAt?: Date | string | null;
  };
  period: {
    year: number;
    month: number;
    startDate: Date | string;
    endDate: Date | string;
    payoutDate?: Date | string | null;
  };
  run: {
    title: string;
    runNumber: number;
    calculationVersion: number;
    parentRunId?: string | null;
    correctionReason?: string | null;
  };
  organization: {
    name: string;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  earnings: Array<{
    componentCode: string;
    componentName: string;
    standardAmount: number;
    earnedAmount: number;
  }>;
  deductions: Array<{
    componentCode: string;
    componentName: string;
    standardAmount: number;
    earnedAmount: number;
  }>;
  employerContributions?: Array<{
    componentCode: string;
    componentName: string;
    amount: number;
  }>;
  totalEmployerContributions?: number;
  totalCtc?: number;
}

@Injectable()
export class PayslipPdfService {
  private readonly logger = new Logger(PayslipPdfService.name);

  /**
   * Generates a tamper-evident, executive salary payslip PDF in memory.
   * Returns a Buffer ready for authenticated, streaming download.
   */
  async generatePayslipPdf(data: GeneratePayslipPdfData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 36, // 0.5 inch margins
          bufferPages: true,
          info: {
            Title: `Payslip - ${data.snapshot.employeeName} (${data.snapshot.payslipNumber})`,
            Author: data.organization.name,
            Subject: `Salary Payslip for ${this.getMonthName(data.period.month)} ${data.period.year}`,
            Keywords: 'HRMS, Payroll, Payslip, Confidential',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        this.buildDocument(doc, data);
        doc.end();
      } catch (err) {
        this.logger.error('Failed to generate payslip PDF', err);
        reject(err);
      }
    });
  }

  private buildDocument(doc: PDFKit.PDFDocument, data: GeneratePayslipPdfData) {
    const {
      snapshot,
      period,
      run,
      organization,
      earnings,
      deductions,
      employerContributions,
      totalEmployerContributions,
    } = data;
    const monthYear = `${this.getMonthName(period.month)} ${period.year}`;
    const currency = snapshot.currency || 'INR';
    const isCorrection = Boolean(run.parentRunId || run.correctionReason);

    const primaryColor = '#1e293b'; // Slate 800
    const accentColor = '#059669'; // Emerald 600
    const lightBg = '#f8fafc'; // Slate 50
    const borderColor = '#cbd5e1'; // Slate 300
    const textMuted = '#64748b'; // Slate 500

    let currentY = 36;

    // -------------------------------------------------------------------------
    // 1. Header & Company Branding
    // -------------------------------------------------------------------------
    doc.rect(36, currentY, 523, 56).fill(lightBg);
    doc.rect(36, currentY, 523, 56).stroke(borderColor);

    doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold');
    doc.text(organization.name.toUpperCase(), 48, currentY + 10, { width: 330 });

    doc.fontSize(8).font('Helvetica').fillColor(textMuted);
    const orgLocation = [organization.city, organization.state, organization.country]
      .filter(Boolean)
      .join(', ');
    doc.text(orgLocation || 'Confidential Payroll Document', 48, currentY + 30);

    // Right-aligned payslip title
    doc.fillColor(accentColor).fontSize(13).font('Helvetica-Bold');
    doc.text('PAYSLIP', 400, currentY + 10, { width: 147, align: 'right' });
    doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text(monthYear.toUpperCase(), 400, currentY + 26, { width: 147, align: 'right' });
    doc.fontSize(7.5).font('Helvetica').fillColor(textMuted);
    doc.text(`Ref: ${snapshot.payslipNumber}`, 400, currentY + 40, { width: 147, align: 'right' });

    currentY += 64;

    // -------------------------------------------------------------------------
    // Optional Correction Banner
    // -------------------------------------------------------------------------
    if (isCorrection) {
      doc.rect(36, currentY, 523, 20).fill('#fef3c7'); // Amber 100
      doc.rect(36, currentY, 523, 20).stroke('#f59e0b');
      doc.fillColor('#92400e').fontSize(8).font('Helvetica-Bold');
      doc.text(
        `CORRECTION RUN (Run #${run.runNumber} • v${run.calculationVersion}): ${run.correctionReason || 'Revised payout revision'}`,
        44,
        currentY + 5,
        { width: 507 },
      );
      currentY += 26;
    }

    // -------------------------------------------------------------------------
    // 2. Employee Profile & Bank Details Box
    // -------------------------------------------------------------------------
    doc.rect(36, currentY, 523, 76).fill('#ffffff').stroke(borderColor);

    // Left Column
    this.renderMetaPair(doc, 'Employee Name', snapshot.employeeName, 46, currentY + 8, 120);
    this.renderMetaPair(doc, 'Employee Code', snapshot.employeeCode, 46, currentY + 24, 120);
    this.renderMetaPair(
      doc,
      'Department',
      snapshot.departmentName || 'General',
      46,
      currentY + 40,
      120,
    );
    this.renderMetaPair(
      doc,
      'Designation',
      snapshot.designationTitle || 'Staff',
      46,
      currentY + 56,
      120,
    );

    // Middle Column
    this.renderMetaPair(
      doc,
      'Branch / Location',
      snapshot.branchName || 'Headquarters',
      185,
      currentY + 8,
      110,
    );
    this.renderMetaPair(
      doc,
      'Bank Name',
      snapshot.bankName || 'Not Registered',
      185,
      currentY + 24,
      110,
    );
    this.renderMetaPair(
      doc,
      'Bank Account',
      snapshot.bankAccountMasked || '••••••••',
      185,
      currentY + 40,
      110,
    );
    this.renderMetaPair(
      doc,
      'PAN Number',
      snapshot.panMasked || '••••••••',
      185,
      currentY + 56,
      110,
    );

    // Right Column
    this.renderMetaPair(doc, 'PF UAN', snapshot.pfUan || 'N/A', 315, currentY + 8, 100);
    this.renderMetaPair(
      doc,
      'Payment Mode',
      snapshot.paymentMethod || 'Bank Transfer',
      315,
      currentY + 24,
      100,
    );
    const payoutFormatted = period.payoutDate ? this.formatDate(period.payoutDate) : 'End of Month';
    this.renderMetaPair(doc, 'Payout Date', payoutFormatted, 315, currentY + 40, 100);
    this.renderMetaPair(
      doc,
      'Pay Period',
      `${this.formatDate(period.startDate)} - ${this.formatDate(period.endDate)}`,
      315,
      currentY + 56,
      100,
    );

    currentY += 84;

    // -------------------------------------------------------------------------
    // 3. Attendance Summary Box
    // -------------------------------------------------------------------------
    doc.rect(36, currentY, 523, 24).fill(lightBg).stroke(borderColor);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text(`ATTENDANCE METRICS:`, 44, currentY + 7);

    doc.font('Helvetica').fontSize(8).fillColor(textMuted);
    doc.text(`Calendar Days: `, 160, currentY + 7);
    doc
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(`${snapshot.calendarDays}`, 225, currentY + 7);

    doc
      .font('Helvetica')
      .fillColor(textMuted)
      .text(`Workdays: `, 260, currentY + 7);
    doc
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(`${snapshot.workingDays}`, 305, currentY + 7);

    doc
      .font('Helvetica')
      .fillColor(textMuted)
      .text(`Paid Days: `, 345, currentY + 7);
    doc
      .font('Helvetica-Bold')
      .fillColor(accentColor)
      .text(`${snapshot.paidDays}`, 390, currentY + 7);

    doc
      .font('Helvetica')
      .fillColor(textMuted)
      .text(`Loss of Pay (LOP): `, 430, currentY + 7);
    doc
      .font('Helvetica-Bold')
      .fillColor(Number(snapshot.lopDays) > 0 ? '#b91c1c' : primaryColor)
      .text(`${snapshot.lopDays}`, 515, currentY + 7);

    currentY += 32;

    // -------------------------------------------------------------------------
    // 4. Two-Column Table: Earnings & Deductions
    // -------------------------------------------------------------------------
    const colWidth = 258;
    const col1X = 36;
    const col2X = 301;
    const headerHeight = 20;

    // Column Headers
    doc.rect(col1X, currentY, colWidth, headerHeight).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
    doc.text('EARNINGS', col1X + 8, currentY + 5);
    doc.text('STANDARD', col1X + 130, currentY + 5, { width: 55, align: 'right' });
    doc.text('EARNED', col1X + 195, currentY + 5, { width: 55, align: 'right' });

    doc.rect(col2X, currentY, colWidth, headerHeight).fill(primaryColor);
    doc.text('DEDUCTIONS', col2X + 8, currentY + 5);
    doc.text('AMOUNT', col2X + 195, currentY + 5, { width: 55, align: 'right' });

    currentY += headerHeight;

    const rowHeight = 17;
    const maxRows = Math.max(earnings.length, deductions.length, 6);
    const tableTop = currentY;

    // Render Rows
    for (let i = 0; i < maxRows; i++) {
      const earn = earnings[i];
      const ded = deductions[i];
      const isAlt = i % 2 === 1;

      // Earnings Row
      if (isAlt) {
        doc.rect(col1X, currentY, colWidth, rowHeight).fill('#f8fafc');
        doc.rect(col2X, currentY, colWidth, rowHeight).fill('#f8fafc');
      }

      if (earn) {
        doc.fillColor(primaryColor).fontSize(8).font('Helvetica');
        doc.text(earn.componentName, col1X + 8, currentY + 4, { width: 120, lineBreak: false });
        doc.text(this.formatCurrency(earn.standardAmount), col1X + 130, currentY + 4, {
          width: 55,
          align: 'right',
        });
        doc.font('Helvetica-Bold');
        doc.text(this.formatCurrency(earn.earnedAmount), col1X + 195, currentY + 4, {
          width: 55,
          align: 'right',
        });
      }

      if (ded) {
        doc.fillColor(primaryColor).fontSize(8).font('Helvetica');
        doc.text(ded.componentName, col2X + 8, currentY + 4, { width: 180, lineBreak: false });
        doc.font('Helvetica-Bold');
        doc.text(this.formatCurrency(ded.earnedAmount), col2X + 195, currentY + 4, {
          width: 55,
          align: 'right',
        });
      }

      currentY += rowHeight;
    }

    // Outer grid border for earnings and deductions tables
    const tableHeight = maxRows * rowHeight;
    doc.rect(col1X, tableTop, colWidth, tableHeight).stroke(borderColor);
    doc.rect(col2X, tableTop, colWidth, tableHeight).stroke(borderColor);

    // Totals Row
    const totalsY = currentY;
    const totalRowHeight = 22;
    doc.rect(col1X, totalsY, colWidth, totalRowHeight).fill('#e2e8f0').stroke(borderColor);
    doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold');
    doc.text('TOTAL GROSS EARNINGS', col1X + 8, totalsY + 6);
    doc.text(this.formatCurrency(snapshot.earnedGross), col1X + 180, totalsY + 6, {
      width: 70,
      align: 'right',
    });

    doc.rect(col2X, totalsY, colWidth, totalRowHeight).fill('#e2e8f0').stroke(borderColor);
    doc.text('TOTAL DEDUCTIONS', col2X + 8, totalsY + 6);
    doc.text(this.formatCurrency(snapshot.totalDeductions), col2X + 180, totalsY + 6, {
      width: 70,
      align: 'right',
    });

    currentY += totalRowHeight + 10;

    // -------------------------------------------------------------------------
    // 5. Highlighted Net Salary Payable Box
    // -------------------------------------------------------------------------
    doc.rect(36, currentY, 523, 44).fill('#ecfdf5').stroke('#10b981'); // Emerald 50 / 500

    doc.fillColor('#065f46').fontSize(10).font('Helvetica-Bold');
    doc.text('NET SALARY DISBURSED / PAYABLE:', 48, currentY + 8);

    doc.fillColor('#047857').fontSize(16).font('Helvetica-Bold');
    doc.text(`${currency} ${this.formatCurrency(snapshot.netSalary)}`, 320, currentY + 8, {
      width: 227,
      align: 'right',
    });

    const words = this.numberToWordsIndian(Math.round(snapshot.netSalary));
    doc.fillColor('#047857').fontSize(8).font('Helvetica-Oblique');
    doc.text(`In words: ${words}`, 48, currentY + 26, { width: 500 });

    currentY += 52;

    // -------------------------------------------------------------------------
    // 6. Employer Contributions (CTC Breakdown, Non-Deducted)
    // -------------------------------------------------------------------------
    if (employerContributions && employerContributions.length > 0) {
      doc.rect(36, currentY, 523, 20).fill(lightBg).stroke(borderColor);
      doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold');
      doc.text(
        'EMPLOYER CONTRIBUTIONS (COMPANY COST - NOT DEDUCTED FROM SALARY):',
        44,
        currentY + 6,
      );

      const itemsText = employerContributions
        .map((c) => `${c.componentName}: ${currency} ${this.formatCurrency(c.amount)}`)
        .join('  |  ');
      doc.font('Helvetica').fontSize(7.5).fillColor(textMuted);
      doc.text(
        `${itemsText}  [Total: ${currency} ${this.formatCurrency(totalEmployerContributions || 0)}]`,
        44,
        currentY + 24,
        { width: 507 },
      );
      currentY += 40;
    }

    // -------------------------------------------------------------------------
    // 7. Security Notice & Footer
    // -------------------------------------------------------------------------
    const footerY = 770;
    doc.rect(36, footerY, 523, 0.5).stroke(borderColor);

    doc.fontSize(7).font('Helvetica').fillColor(textMuted);
    doc.text(
      'This document is an electronically generated salary payslip issued under company authority and requires no physical signature.',
      36,
      footerY + 6,
      { align: 'center', width: 523 },
    );

    const publishedDate = snapshot.publishedAt
      ? new Date(snapshot.publishedAt).toISOString().split('T')[0]
      : 'CONFIDENTIAL';
    doc.text(
      `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC • Verified Publication Date: ${publishedDate} • System ID: ${snapshot.payslipNumber}`,
      36,
      footerY + 16,
      { align: 'center', width: 523 },
    );
  }

  private renderMetaPair(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    labelWidth: number,
  ) {
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748b');
    doc.text(`${label}:`, x, y, { width: labelWidth });
    doc.font('Helvetica-Bold').fillColor('#1e293b');
    doc.text(value, x + labelWidth, y, { width: 140, lineBreak: false });
  }

  private formatCurrency(amount: number | string | null | undefined): string {
    const num = Number(amount || 0);
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatDate(d: Date | string): string {
    try {
      const date = new Date(d);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(d);
    }
  }

  private getMonthName(monthNumber: number): string {
    const names = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return names[monthNumber - 1] || `Month ${monthNumber}`;
  }

  /**
   * Converts a positive integer into words using Indian Numbering Notation
   * (Crores, Lakhs, Thousands, Hundreds).
   */
  public numberToWordsIndian(n: number): string {
    if (isNaN(n) || n === 0) return 'Zero Rupees Only';

    const units = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    const numToWordsLessThanThousand = (num: number): string => {
      let str = '';
      if (num >= 100) {
        str += units[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
      }
      if (num >= 20) {
        str += tens[Math.floor(num / 10)] + ' ';
        num %= 10;
      }
      if (num > 0) {
        str += units[num] + ' ';
      }
      return str.trim();
    };

    let integerPart = Math.floor(Math.abs(n));
    let result = '';

    if (integerPart >= 10000000) {
      const crores = Math.floor(integerPart / 10000000);
      result += numToWordsLessThanThousand(crores) + ' Crore ';
      integerPart %= 10000000;
    }
    if (integerPart >= 100000) {
      const lakhs = Math.floor(integerPart / 100000);
      result += numToWordsLessThanThousand(lakhs) + ' Lakh ';
      integerPart %= 100000;
    }
    if (integerPart >= 1000) {
      const thousands = Math.floor(integerPart / 1000);
      result += numToWordsLessThanThousand(thousands) + ' Thousand ';
      integerPart %= 1000;
    }
    if (integerPart > 0) {
      result += numToWordsLessThanThousand(integerPart) + ' ';
    }

    return `Rupees ${result.trim()} Only`;
  }
}
