import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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
import {
  applyResidentScope,
  assertFlatMatch,
  assertSocietyMatch,
} from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

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

  async listResidents(
    societyId: string,
    scope: TenantScope,
    filter?: string,
  ): Promise<Resident[]> {
    assertSocietyMatch(societyId, scope);
    let qb = this.residents
      .createQueryBuilder('resident')
      .where('resident.society_id = :societyId', { societyId });
    qb = applyResidentScope(qb, 'resident', scope);

    if (filter === 'senior_citizen') {
      qb = qb.andWhere('resident.is_senior_citizen = true');
    }

    return qb.orderBy('resident.created_at', 'DESC').getMany();
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
}
