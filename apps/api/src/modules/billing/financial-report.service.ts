import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bill } from '../../database/entities/bill.entity';
import { BillService } from './bill.service';
import { CLOCK, type Clock } from '../../common/clock';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

export interface FinancialSummary {
  societyId: string;
  totalBilled: string;
  totalCollected: string;
  collectionEfficiencyPct: string;
  outstandingAging: {
    days0To30: string;
    days30To60: string;
    days60Plus: string;
  };
}

@Injectable()
export class FinancialReportService {
  constructor(
    @InjectRepository(Bill) private readonly bills: Repository<Bill>,
    private readonly billService: BillService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * A report is not an exception to ABAC (deliverable #8) — same
   * tenant-scope pattern as every other module: society-wide roles get
   * their own society, platform-tier roles must pass `societyId` explicitly
   * (they have no single "own" society), flat-pinned roles (Owner/Tenant)
   * can't reach this at all — gated by the `billing:read` permission they
   * don't hold, same as the resident-module precedent for admin-only reads.
   */
  async getFinancialSummary(scope: TenantScope, requestedSocietyId?: string): Promise<FinancialSummary> {
    let societyId: string;
    if (scope.isPlatformScope) {
      if (!requestedSocietyId) {
        throw new ForbiddenException('Platform-tier callers must specify ?societyId=');
      }
      societyId = requestedSocietyId;
    } else {
      if (!scope.societyId) throw new ForbiddenException('No society scope on this session');
      societyId = requestedSocietyId ?? scope.societyId;
      assertSocietyMatch(societyId, scope);
    }

    await this.billService.applyLateFeesForOverdueBills(societyId, this.clock.now());

    const bills = await this.bills.find({ where: { societyId } });

    const totalBilled = bills.reduce((sum, b) => sum + Number(b.amountDue), 0);
    const totalCollected = bills.reduce((sum, b) => sum + Number(b.amountPaid), 0);
    const collectionEfficiencyPct = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(2) : '0.00';

    const now = this.clock.now();
    const aging = { days0To30: 0, days30To60: 0, days60Plus: 0 };
    for (const bill of bills) {
      const outstanding = Number(bill.amountDue) - Number(bill.amountPaid);
      if (outstanding <= 0) continue;
      const daysOverdue = Math.floor((now.getTime() - new Date(bill.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 30) aging.days0To30 += outstanding;
      else if (daysOverdue <= 60) aging.days30To60 += outstanding;
      else aging.days60Plus += outstanding;
    }

    return {
      societyId,
      totalBilled: totalBilled.toFixed(2),
      totalCollected: totalCollected.toFixed(2),
      collectionEfficiencyPct,
      outstandingAging: {
        days0To30: aging.days0To30.toFixed(2),
        days30To60: aging.days30To60.toFixed(2),
        days60Plus: aging.days60Plus.toFixed(2),
      },
    };
  }
}
