import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Resident } from '../../database/entities/resident.entity';
import { LeaseDetail } from '../../database/entities/lease-detail.entity';
import { Vehicle } from '../../database/entities/vehicle.entity';
import { Pet } from '../../database/entities/pet.entity';
import { ResidentDocument } from '../../database/entities/resident-document.entity';
import { MoveEvent } from '../../database/entities/move-event.entity';
import { Flat } from '../../database/entities/flat.entity';
import { User } from '../../database/entities/user.entity';
import { CreateResidentDto } from './dto/create-resident.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { CreateResidentDocumentDto } from './dto/create-resident-document.dto';
import { MoveOutDto } from './dto/move-out.dto';
import { ResidentListQueryDto } from './dto/resident-list-query.dto';
import { ResidentResponseDto } from './dto/resident-response.dto';
import { PaginatedResidentResponseDto } from './dto/paginated-resident-response.dto';
import { FlatDetailResponseDto } from './dto/flat-detail-response.dto';
import { encodeCursor, decodeCursor } from '../../common/pagination/cursor.util';
import {
  applyResidentScope,
  assertFlatMatch,
  assertSocietyMatch,
} from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

const DEFAULT_LIST_PAGE_SIZE = 20;

function toResidentResponseDto(resident: Resident, flat: Flat, user: User | null): ResidentResponseDto {
  return {
    id: resident.id,
    flat: { id: flat.id, flatNumber: flat.flatNumber },
    user: user ? { id: user.id, phone: user.phone, email: user.email } : null,
    relationType: resident.relationType,
    isSeniorCitizen: resident.isSeniorCitizen,
    isChild: resident.isChild,
    moveInDate: resident.moveInDate,
    moveOutDate: resident.moveOutDate,
    status: resident.status,
    createdAt: resident.createdAt.toISOString(),
  };
}

@Injectable()
export class ResidentService {
  constructor(
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(LeaseDetail) private readonly leaseDetails: Repository<LeaseDetail>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Pet) private readonly pets: Repository<Pet>,
    @InjectRepository(ResidentDocument) private readonly residentDocuments: Repository<ResidentDocument>,
    @InjectRepository(MoveEvent) private readonly moveEvents: Repository<MoveEvent>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async loadFlatOrThrow(flatId: string): Promise<Flat> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    return flat;
  }

  private async loadResidentOrThrow(residentId: string): Promise<Resident> {
    const resident = await this.residents.findOne({ where: { id: residentId } });
    if (!resident) throw new NotFoundException('Resident not found');
    return resident;
  }

  private assertCanActOnFlat(flat: Flat, scope: TenantScope): void {
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);
  }

  /**
   * Access delegation (§5.4): the Owner is the root authority for a unit.
   * Creating a resident row with relation_type=tenant here IS the
   * "resident_unit_mapping" the SRS describes — confirmed sufficient for
   * this phase: `residents` already carries flat_id + relation_type +
   * move_in/out dates, and `lease_details` carries lease_start/lease_end.
   * The one thing a dedicated mapping table would add — a distinct
   * "invited but not yet accepted" state — doesn't exist yet; today an
   * invite immediately creates an active resident row. If/when an
   * accept/decline step is needed, `residents.status` already has room to
   * grow (e.g. an `invited` value) without a schema change.
   */
  async createResident(
    flatId: string,
    dto: CreateResidentDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<Resident> {
    const flat = await this.loadFlatOrThrow(flatId);
    this.assertCanActOnFlat(flat, scope);

    let userId: string | null = null;
    if (dto.phone) {
      let user = await this.users.findOne({ where: { phone: dto.phone } });
      if (!user) {
        user = this.users.create({ phone: dto.phone, status: 'pending_verification' });
        await this.users.save(user);
      }
      userId = user.id;
    }

    const resident = this.residents.create({
      societyId: flat.societyId,
      flatId: flat.id,
      userId,
      relationType: dto.relationType,
      isSeniorCitizen: dto.isSeniorCitizen ?? false,
      isChild: dto.isChild ?? false,
      moveInDate: dto.moveInDate ?? null,
      status: 'active',
      createdBy,
      updatedBy: createdBy,
    });
    await this.residents.save(resident);

    if (dto.relationType === 'tenant') {
      if (!dto.leaseStart || !dto.leaseEnd) {
        throw new BadRequestException('leaseStart and leaseEnd are required when inviting a tenant');
      }
      const lease = this.leaseDetails.create({
        societyId: flat.societyId,
        residentId: resident.id,
        leaseStart: dto.leaseStart,
        leaseEnd: dto.leaseEnd,
        monthlyRent: dto.monthlyRent !== undefined ? String(dto.monthlyRent) : null,
        depositAmount: dto.depositAmount !== undefined ? String(dto.depositAmount) : null,
        createdBy,
        updatedBy: createdBy,
      });
      await this.leaseDetails.save(lease);
    }

    return resident;
  }

  async createVehicle(
    residentId: string,
    dto: CreateVehicleDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<Vehicle> {
    const resident = await this.loadResidentOrThrow(residentId);
    const flat = await this.loadFlatOrThrow(resident.flatId);
    this.assertCanActOnFlat(flat, scope);

    const vehicle = this.vehicles.create({
      societyId: flat.societyId,
      flatId: flat.id,
      ownerResidentId: resident.id,
      type: dto.type,
      registrationNumber: dto.registrationNumber,
      rcDocUrl: dto.rcDocUrl ?? null,
      createdBy,
      updatedBy: createdBy,
    });
    return this.vehicles.save(vehicle);
  }

  /** pets are flat-scoped, not resident-scoped, per §6 Module 3's DDL — the resident_id in the URL resolves which flat, the row itself doesn't carry it. */
  async createPet(
    residentId: string,
    dto: CreatePetDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<Pet> {
    const resident = await this.loadResidentOrThrow(residentId);
    const flat = await this.loadFlatOrThrow(resident.flatId);
    this.assertCanActOnFlat(flat, scope);

    const pet = this.pets.create({
      societyId: flat.societyId,
      flatId: flat.id,
      name: dto.name,
      species: dto.species,
      vaccinationDocUrl: dto.vaccinationDocUrl ?? null,
      createdBy,
      updatedBy: createdBy,
    });
    return this.pets.save(pet);
  }

  async createResidentDocument(
    residentId: string,
    dto: CreateResidentDocumentDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<ResidentDocument> {
    const resident = await this.loadResidentOrThrow(residentId);
    const flat = await this.loadFlatOrThrow(resident.flatId);
    this.assertCanActOnFlat(flat, scope);

    const doc = this.residentDocuments.create({
      societyId: flat.societyId,
      residentId: resident.id,
      docType: dto.docType,
      fileUrl: dto.fileUrl,
      createdBy,
      updatedBy: createdBy,
    });
    return this.residentDocuments.save(doc);
  }

  /**
   * §3 validation: move-out is blocked if dues_cleared=false unless an admin
   * overrides with a reason. "Blocked" here means the move_events row is
   * still written (for audit — we don't pretend the attempt never happened)
   * but the resident is NOT marked moved_out and the flat stays occupied;
   * only a successful (dues cleared, or dues not cleared + valid override)
   * move-out actually flips resident.status/flat.status.
   */
  async moveOut(
    flatId: string,
    dto: MoveOutDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<{ blocked: boolean; moveEvent: MoveEvent }> {
    const flat = await this.loadFlatOrThrow(flatId);
    this.assertCanActOnFlat(flat, scope);

    const resident = await this.loadResidentOrThrow(dto.residentId);
    if (resident.flatId !== flatId) {
      throw new BadRequestException('residentId does not belong to this flat');
    }

    const blocked = !dto.duesCleared && !(dto.override && dto.overrideReason);

    const moveEvent = this.moveEvents.create({
      societyId: flat.societyId,
      flatId: flat.id,
      residentId: resident.id,
      eventType: 'move_out',
      checklistJson: dto.checklist ?? {},
      duesCleared: dto.duesCleared,
      overrideReason: dto.override ? (dto.overrideReason ?? null) : null,
      overriddenBy: dto.override ? actorId : null,
      createdBy: actorId,
    });
    await this.moveEvents.save(moveEvent);

    if (!blocked) {
      await this.residents.update(resident.id, {
        status: 'moved_out',
        moveOutDate: new Date().toISOString().slice(0, 10),
        updatedBy: actorId,
      });

      const stillOccupied = await this.residents.exist({
        where: { flatId: flat.id, status: 'active' },
      });
      if (!stillOccupied) {
        await this.flats.update(flat.id, { status: 'vacant' });
      }
    }

    return { blocked, moveEvent };
  }

  /**
   * Cursor-paginated, same `created_at DESC, id DESC` keyset convention as
   * the visit-history endpoint (reuses the same encode/decodeCursor
   * utility) — the highest-row-count table in the admin console needs the
   * same real pagination as everywhere else, not a client-side-only list
   * that silently breaks past one page. `flatNumber` is an ILIKE search
   * (admin's "search by flat" box); `flatId` is an exact match (the
   * flat-detail view's "residents of this flat" case) — both narrow via a
   * join on `flats`, never a second unscoped query.
   */
  async listResidents(
    societyId: string,
    scope: TenantScope,
    query: ResidentListQueryDto,
  ): Promise<PaginatedResidentResponseDto> {
    assertSocietyMatch(societyId, scope);
    const limit = Math.min(query.limit ?? DEFAULT_LIST_PAGE_SIZE, 100);

    // .limit(), not .take() — TypeORM's take/skip pagination breaks once a
    // join is present (it tries to paginate the joined result set rather
    // than the root entity), which is exactly the flat_number search join
    // below. .limit()/.offset() map straight to SQL LIMIT and don't have
    // that problem.
    let qb = this.residents
      .createQueryBuilder('resident')
      .innerJoin('flats', 'flat', 'flat.id = resident.flat_id')
      .where('resident.society_id = :societyId', { societyId })
      .orderBy('resident.created_at', 'DESC')
      .addOrderBy('resident.id', 'DESC')
      .limit(limit + 1);
    qb = applyResidentScope(qb, 'resident', scope);

    if (query.filter === 'senior_citizen') {
      qb = qb.andWhere('resident.is_senior_citizen = true');
    }
    if (query.flatId) {
      qb = qb.andWhere('resident.flat_id = :flatId', { flatId: query.flatId });
    }
    if (query.flatNumber) {
      qb = qb.andWhere('flat.flat_number ILIKE :flatNumber', { flatNumber: `%${query.flatNumber}%` });
    }
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      qb = qb.andWhere(
        '(resident.created_at < :cursorCreatedAt OR (resident.created_at = :cursorCreatedAt AND resident.id < :cursorId))',
        { cursorCreatedAt: decoded.createdAt, cursorId: decoded.id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const flatIds = [...new Set(page.map((r) => r.flatId))];
    const userIds = [...new Set(page.map((r) => r.userId).filter((id): id is string => id !== null))];
    const [flatRows, userRows] = await Promise.all([
      flatIds.length ? this.flats.find({ where: { id: In(flatIds) } }) : Promise.resolve([]),
      userIds.length ? this.users.find({ where: { id: In(userIds) } }) : Promise.resolve([]),
    ]);
    const flatsById = new Map(flatRows.map((f) => [f.id, f]));
    const usersById = new Map(userRows.map((u) => [u.id, u]));

    const data = page
      .filter((resident) => flatsById.has(resident.flatId))
      .map((resident) =>
        toResidentResponseDto(
          resident,
          flatsById.get(resident.flatId)!,
          resident.userId ? (usersById.get(resident.userId) ?? null) : null,
        ),
      );

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

    return { data, pagination: { nextCursor, hasMore } };
  }

  /**
   * Not wired to a real scheduler this session (deliberately — see task
   * scope). In production this would run as a nightly job, e.g. a NestJS
   * `@Cron('0 2 * * *')` handler (via `@nestjs/schedule`) or an
   * infra-level scheduled task hitting an internal endpoint, calling this
   * method once per day. Suspends, never deletes — historical
   * visitor/complaint/billing records tied to a suspended resident must
   * stay queryable.
   */
  async suspendExpiredLeases(asOf: Date = new Date()): Promise<number> {
    const today = asOf.toISOString().slice(0, 10);
    const expiredLeases = await this.leaseDetails.find({ where: { leaseEnd: LessThan(today) } });

    let suspended = 0;
    for (const lease of expiredLeases) {
      const resident = await this.residents.findOne({ where: { id: lease.residentId } });
      if (resident && resident.status === 'active' && resident.relationType === 'tenant') {
        await this.residents.update(resident.id, { status: 'suspended' });
        suspended++;
      }
    }
    return suspended;
  }

  /**
   * Deliverable #3's "one place" flat view: residents (each with their own
   * vehicles) plus the flat's pets. `assertFlatMatch` gates a flat-pinned
   * caller to their own flat, same as every other flat-scoped read in this
   * module — a new join is exactly the kind of change that can widen a
   * query across tenants if the scope check isn't carried through, so this
   * gets the same ABAC boundary treatment as everything else.
   */
  async getFlatDetail(flatId: string, scope: TenantScope): Promise<FlatDetailResponseDto> {
    const flat = await this.loadFlatOrThrow(flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const [residents, pets] = await Promise.all([
      this.residents.find({ where: { flatId: flat.id }, order: { createdAt: 'ASC' } }),
      this.pets.find({ where: { flatId: flat.id }, order: { createdAt: 'ASC' } }),
    ]);

    const residentIds = residents.map((r) => r.id);
    const userIds = [...new Set(residents.map((r) => r.userId).filter((id): id is string => id !== null))];
    const [vehicleRows, userRows] = await Promise.all([
      residentIds.length ? this.vehicles.find({ where: { ownerResidentId: In(residentIds) } }) : Promise.resolve([]),
      userIds.length ? this.users.find({ where: { id: In(userIds) } }) : Promise.resolve([]),
    ]);
    const vehiclesByResident = new Map<string, Vehicle[]>();
    for (const vehicle of vehicleRows) {
      const list = vehiclesByResident.get(vehicle.ownerResidentId) ?? [];
      list.push(vehicle);
      vehiclesByResident.set(vehicle.ownerResidentId, list);
    }
    const usersById = new Map(userRows.map((u) => [u.id, u]));

    return {
      id: flat.id,
      flatNumber: flat.flatNumber,
      floorNumber: flat.floorNumber,
      status: flat.status,
      residents: residents.map((resident) => ({
        id: resident.id,
        user: resident.userId
          ? (() => {
              const user = usersById.get(resident.userId!);
              return user ? { id: user.id, phone: user.phone, email: user.email } : null;
            })()
          : null,
        relationType: resident.relationType,
        isSeniorCitizen: resident.isSeniorCitizen,
        isChild: resident.isChild,
        status: resident.status,
        vehicles: (vehiclesByResident.get(resident.id) ?? []).map((v) => ({
          id: v.id,
          type: v.type,
          registrationNumber: v.registrationNumber,
        })),
      })),
      pets: pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species })),
    };
  }
}
