import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DomesticStaff } from '../../database/entities/domestic-staff.entity';
import { StaffFlatMapping } from '../../database/entities/staff-flat-mapping.entity';
import { StaffAttendance } from '../../database/entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../database/entities/staff-leave-request.entity';
import { Flat } from '../../database/entities/flat.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { CLOCK, type Clock } from '../../common/clock';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateStaffDto } from './dto/create-staff.dto';
import { CreateFlatMappingDto } from './dto/create-flat-mapping.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { SetPoliceVerificationDocumentDto } from './dto/set-police-verification-document.dto';
import { SetPoliceVerificationStatusDto } from './dto/set-police-verification-status.dto';

/**
 * Police-verification read/write is gated by a scope check, not a separate
 * permission — deliverable #8 seeds only `domestic-staff:manage/read`, so
 * "Admin/Manager only, not even the flat the staff serves" (deliverable #4)
 * is enforced by requiring a society-wide scope (`scope.flatId === null`),
 * the same flat-pinned-vs-society-wide distinction already used everywhere
 * else in this codebase (see visit-approval.service.ts's
 * assertCanActOnVisit comment). An Owner/Tenant holding `domestic-staff:
 * manage` (ABAC-narrowed to their own flat) can onboard staff and manage the
 * flat-mapping, but this explicit check blocks them from ever reaching the
 * verification document itself, regardless of their permission grant.
 */
function assertSocietyWideScope(scope: TenantScope): void {
  if (scope.isPlatformScope) return;
  if (scope.flatId !== null) {
    throw new ForbiddenException('Police-verification records are restricted to Society Admin/Manager roles');
  }
}

@Injectable()
export class DomesticStaffService {
  constructor(
    @InjectRepository(DomesticStaff) private readonly staff: Repository<DomesticStaff>,
    @InjectRepository(StaffFlatMapping) private readonly mappings: Repository<StaffFlatMapping>,
    @InjectRepository(StaffAttendance) private readonly attendance: Repository<StaffAttendance>,
    @InjectRepository(StaffLeaveRequest) private readonly leaveRequests: Repository<StaffLeaveRequest>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    private readonly auditService: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Global directory, keyed by phone — same find-or-create pattern as Visitor. */
  async createOrFindStaff(dto: CreateStaffDto): Promise<DomesticStaff> {
    const existing = await this.staff.findOne({ where: { phone: dto.phone } });
    if (existing) return existing;

    const created = this.staff.create({
      name: dto.name,
      phone: dto.phone,
      staffType: dto.staffType,
      photoUrl: dto.photoUrl ?? null,
    });
    return this.staff.save(created);
  }

  private async loadFlatOrThrow(flatId: string): Promise<Flat> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    return flat;
  }

  private async loadStaffOrThrow(staffId: string): Promise<DomesticStaff> {
    const record = await this.staff.findOne({ where: { id: staffId } });
    if (!record) throw new NotFoundException('Staff not found');
    return record;
  }

  async createFlatMapping(
    staffId: string,
    dto: CreateFlatMappingDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<StaffFlatMapping> {
    await this.loadStaffOrThrow(staffId);
    const flat = await this.loadFlatOrThrow(dto.flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const mapping = this.mappings.create({
      societyId: flat.societyId,
      staffId,
      flatId: flat.id,
      monthlySalary: dto.monthlySalary !== undefined ? String(dto.monthlySalary) : null,
      workDays: dto.workDays ?? null,
      active: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
    try {
      return await this.mappings.save(mapping);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException('Staff is already actively mapped to this flat');
      }
      throw err;
    }
  }

  async deactivateFlatMapping(mappingId: string, scope: TenantScope, actorId: string): Promise<StaffFlatMapping> {
    const mapping = await this.mappings.findOne({ where: { id: mappingId } });
    if (!mapping) throw new NotFoundException('Staff-flat mapping not found');
    assertSocietyMatch(mapping.societyId, scope);
    assertFlatMatch(mapping.flatId, scope);

    mapping.active = false;
    mapping.updatedBy = actorId;
    return this.mappings.save(mapping);
  }

  async listForFlat(flatId: string, scope: TenantScope): Promise<Array<StaffFlatMapping & { staff: DomesticStaff }>> {
    const flat = await this.loadFlatOrThrow(flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const activeMappings = await this.mappings.find({ where: { flatId, active: true } });
    const results = [];
    for (const mapping of activeMappings) {
      const staffRecord = await this.loadStaffOrThrow(mapping.staffId);
      // Police-verification fields never appear in this response, regardless
      // of the caller's permission — the dedicated endpoint below is the
      // only read path for them (deliverable #4).
      const { policeVerificationDocUrl: _doc, ...safeStaff } = staffRecord;
      results.push({ ...mapping, staff: safeStaff as DomesticStaff });
    }
    return results;
  }

  async checkIn(dto: CheckInDto, scope: TenantScope): Promise<StaffAttendance> {
    const flat = await this.loadFlatOrThrow(dto.flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);
    await this.loadStaffOrThrow(dto.staffId);

    const today = this.clock.now().toISOString().slice(0, 10);
    const existing = await this.attendance.findOne({
      where: { staffId: dto.staffId, flatId: dto.flatId, date: today },
    });
    if (existing) return existing;

    const record = this.attendance.create({
      societyId: flat.societyId,
      staffId: dto.staffId,
      flatId: dto.flatId,
      date: today,
      checkInTime: this.clock.now(),
      verificationMethod: dto.verificationMethod ?? 'manual',
    });
    try {
      return await this.attendance.save(record);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const race = await this.attendance.findOne({
          where: { staffId: dto.staffId, flatId: dto.flatId, date: today },
        });
        if (race) return race;
      }
      throw err;
    }
  }

  async checkOut(dto: CheckOutDto, scope: TenantScope): Promise<StaffAttendance> {
    const flat = await this.loadFlatOrThrow(dto.flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const today = this.clock.now().toISOString().slice(0, 10);
    const record = await this.attendance.findOne({
      where: { staffId: dto.staffId, flatId: dto.flatId, date: today },
    });
    if (!record) throw new NotFoundException('No check-in recorded for today');
    if (record.checkOutTime) throw new BadRequestException('Already checked out today');

    record.checkOutTime = this.clock.now();
    return this.attendance.save(record);
  }

  async attendanceSummary(
    flatId: string,
    month: string,
    scope: TenantScope,
  ): Promise<Array<{ staffId: string; present: number; absent: number }>> {
    const flat = await this.loadFlatOrThrow(flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const monthStart = month.slice(0, 7);
    const rows = await this.attendance
      .createQueryBuilder('a')
      .where('a.flat_id = :flatId', { flatId })
      .andWhere("to_char(a.date, 'YYYY-MM') = :monthStart", { monthStart })
      .getMany();

    const byStaff = new Map<string, { present: number; absent: number }>();
    for (const row of rows) {
      const bucket = byStaff.get(row.staffId) ?? { present: 0, absent: 0 };
      if (row.checkInTime) bucket.present++;
      else bucket.absent++;
      byStaff.set(row.staffId, bucket);
    }
    return Array.from(byStaff.entries()).map(([staffId, counts]) => ({ staffId, ...counts }));
  }

  async createLeaveRequest(dto: CreateLeaveRequestDto, scope: TenantScope): Promise<StaffLeaveRequest> {
    const flat = await this.loadFlatOrThrow(dto.flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);
    await this.loadStaffOrThrow(dto.staffId);

    const record = this.leaveRequests.create({
      societyId: flat.societyId,
      staffId: dto.staffId,
      flatId: dto.flatId,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      reason: dto.reason ?? null,
      status: 'pending',
    });
    return this.leaveRequests.save(record);
  }

  async approveLeaveRequest(leaveRequestId: string, scope: TenantScope): Promise<StaffLeaveRequest> {
    const record = await this.leaveRequests.findOne({ where: { id: leaveRequestId } });
    if (!record) throw new NotFoundException('Leave request not found');
    assertSocietyMatch(record.societyId, scope);
    assertFlatMatch(record.flatId, scope);

    if (record.status !== 'pending') {
      throw new BadRequestException(`Cannot approve a leave request with status "${record.status}"`);
    }
    record.status = 'approved';
    return this.leaveRequests.save(record);
  }

  private async assertStaffMappedWithinScope(staffId: string, scope: TenantScope): Promise<DomesticStaff> {
    const staffRecord = await this.loadStaffOrThrow(staffId);
    if (scope.isPlatformScope) return staffRecord;
    if (!scope.societyId) {
      throw new ForbiddenException("Staff is not mapped within the caller's society");
    }

    const mapping = await this.mappings.findOne({
      where: { staffId, societyId: scope.societyId, active: true },
    });
    if (!mapping) {
      throw new ForbiddenException("Staff is not mapped within the caller's society");
    }
    return staffRecord;
  }

  async setPoliceVerificationDocument(
    staffId: string,
    dto: SetPoliceVerificationDocumentDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<DomesticStaff> {
    assertSocietyWideScope(scope);
    const staffRecord = await this.assertStaffMappedWithinScope(staffId, scope);

    const before = {
      policeVerificationDocUrl: staffRecord.policeVerificationDocUrl,
      policeVerificationStatus: staffRecord.policeVerificationStatus,
    };
    staffRecord.policeVerificationDocUrl = dto.fileUrl;
    staffRecord.policeVerificationStatus = 'pending'; // a new upload always needs re-verification
    const saved = await this.staff.save(staffRecord);

    await this.auditService.record({
      actorId,
      societyId: scope.societyId,
      action: AUDIT_ACTIONS.DOMESTIC_STAFF_DOC_UPLOADED,
      entityType: 'domestic_staff',
      entityId: staffId,
      beforeState: before,
      afterState: {
        policeVerificationDocUrl: saved.policeVerificationDocUrl,
        policeVerificationStatus: saved.policeVerificationStatus,
      },
    });

    return saved;
  }

  async setPoliceVerificationStatus(
    staffId: string,
    dto: SetPoliceVerificationStatusDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<DomesticStaff> {
    assertSocietyWideScope(scope);
    const staffRecord = await this.assertStaffMappedWithinScope(staffId, scope);

    const before = { policeVerificationStatus: staffRecord.policeVerificationStatus };
    staffRecord.policeVerificationStatus = dto.status;
    const saved = await this.staff.save(staffRecord);

    await this.auditService.record({
      actorId,
      societyId: scope.societyId,
      action: AUDIT_ACTIONS.DOMESTIC_STAFF_DOC_STATUS_CHANGED,
      entityType: 'domestic_staff',
      entityId: staffId,
      beforeState: before,
      afterState: { policeVerificationStatus: saved.policeVerificationStatus },
    });

    return saved;
  }

  async getPoliceVerificationDocument(
    staffId: string,
    scope: TenantScope,
    actorId: string,
  ): Promise<{ fileUrl: string | null; status: string }> {
    assertSocietyWideScope(scope);
    const staffRecord = await this.assertStaffMappedWithinScope(staffId, scope);

    // Every access to this sensitive field is logged — same posture §21
    // describes for `document_access_log` on `is_sensitive` documents, and
    // CLAUDE.md's non-negotiable audit requirement.
    await this.auditService.record({
      actorId,
      societyId: scope.societyId,
      action: AUDIT_ACTIONS.DOMESTIC_STAFF_DOC_ACCESSED,
      entityType: 'domestic_staff',
      entityId: staffId,
      afterState: null,
    });

    return { fileUrl: staffRecord.policeVerificationDocUrl, status: staffRecord.policeVerificationStatus };
  }
}
