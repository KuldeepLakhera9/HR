import { Controller, Get, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../auth/interfaces/auth.interface';
import { PayslipsService } from '../services/payslips.service';

@ApiTags('Payroll Payslips & ESS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payroll/payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get('my-payslips')
  @ApiOperation({
    summary: 'ESS: Get published salary payslips history for the authenticated employee',
  })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyPayslips(
    @Req() req: AuthenticatedRequest,
    @Query('year') year?: number,
    @Query('month') month?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.payslipsService.getMyPayslips(req.user, {
      year,
      month,
      page,
      limit,
    });
    return {
      success: true,
      message: 'Employee payslips retrieved successfully',
      data: data.items,
      meta: data.meta,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get itemized payslip breakdown, working days, earnings, deductions, and version lineage',
  })
  async getPayslipDetail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.payslipsService.getPayslipDetail(id, req.user);
    return {
      success: true,
      message: 'Payslip details retrieved successfully',
      data,
    };
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary:
      'Download secure, authorized salary payslip PDF document with live permission validation',
  })
  async downloadPdf(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const result = await this.payslipsService.getPayslipPdfBuffer(id, req.user);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    });

    res.send(result.buffer);
  }
}
