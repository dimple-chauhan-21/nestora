import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { Society } from '../../database/entities/society.entity';
import { SocietySettings } from '../../database/entities/society-settings.entity';
import { AmenityMaster } from '../../database/entities/amenity-master.entity';
import { SocietyDocument } from '../../database/entities/society-document.entity';
import { Flat } from '../../database/entities/flat.entity';
import { CreateSocietyDto } from './dto/create-society.dto';
import { UpdateSocietySettingsDto } from './dto/update-society-settings.dto';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { CreateSocietyDocumentDto } from './dto/create-society-document.dto';
import { applySocietyScope, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

export interface BulkImportRowError {
  row: number;
  flatNumber: string | null;
  error: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: BulkImportRowError[];
}

interface FlatCsvRow {
  tower_name?: string;
  floor_number?: string;
  flat_number?: string;
  type?: string;
  area_sqft?: string;
}

@Injectable()
export class SocietyService {
  constructor(
    @InjectRepository(Society) private readonly societies: Repository<Society>,
    @InjectRepository(SocietySettings) private readonly settings: Repository<SocietySettings>,
    @InjectRepository(AmenityMaster) private readonly amenities: Repository<AmenityMaster>,
    @InjectRepository(SocietyDocument) private readonly documents: Repository<SocietyDocument>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
  ) {}

  /** Society creation has no society_id to scope by yet — gated entirely by @RequirePermission at the controller (Super Admin/Company Admin only, per §2's security note). */
  async create(dto: CreateSocietyDto, createdBy: string): Promise<Society> {
    const society = this.societies.create({
      name: dto.name,
      address: dto.address ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      pincode: dto.pincode ?? null,
      registrationNumber: dto.registrationNumber ?? null,
      companyId: dto.companyId ?? null,
      currency: dto.currency ?? 'INR',
      createdBy,
      updatedBy: createdBy,
    });
    await this.societies.save(society);

    const settings = this.settings.create({ societyId: society.id, createdBy, updatedBy: createdBy });
    await this.settings.save(settings);

    return society;
  }

  async findById(id: string, scope: TenantScope): Promise<Society> {
    assertSocietyMatch(id, scope);
    const qb = applySocietyScope(
      this.societies.createQueryBuilder('society').where('society.id = :id', { id }),
      'society',
      scope,
    );
    const society = await qb.getOne();
    if (!society) throw new NotFoundException('Society not found');
    return society;
  }

  async updateSettings(
    societyId: string,
    dto: UpdateSocietySettingsDto,
    scope: TenantScope,
    updatedBy: string,
  ): Promise<SocietySettings> {
    assertSocietyMatch(societyId, scope);
    const qb = applySocietyScope(
      this.settings.createQueryBuilder('settings').where('settings.society_id = :societyId', { societyId }),
      'settings',
      scope,
    );
    const existing = await qb.getOne();
    if (!existing) throw new NotFoundException('Society settings not found');

    if (dto.billingCycleDay !== undefined) existing.billingCycleDay = dto.billingCycleDay;
    if (dto.lateFeePct !== undefined) existing.lateFeePct = String(dto.lateFeePct);
    if (dto.fiscalYearStartMonth !== undefined) existing.fiscalYearStartMonth = dto.fiscalYearStartMonth;
    if (dto.featureFlags !== undefined) existing.featureFlags = dto.featureFlags;
    existing.updatedBy = updatedBy;

    return this.settings.save(existing);
  }

  async listFlats(societyId: string, scope: TenantScope): Promise<Flat[]> {
    assertSocietyMatch(societyId, scope);
    const qb = applySocietyScope(
      this.flats.createQueryBuilder('flat').where('flat.society_id = :societyId', { societyId }),
      'flat',
      scope,
    );
    return qb.orderBy('flat.flat_number', 'ASC').getMany();
  }

  async createAmenity(
    societyId: string,
    dto: CreateAmenityDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<AmenityMaster> {
    assertSocietyMatch(societyId, scope);
    const amenity = this.amenities.create({
      societyId,
      name: dto.name,
      type: dto.type ?? null,
      capacity: dto.capacity ?? null,
      bookingRequired: dto.bookingRequired ?? false,
      createdBy,
      updatedBy: createdBy,
    });
    return this.amenities.save(amenity);
  }

  async createDocument(
    societyId: string,
    dto: CreateSocietyDocumentDto,
    scope: TenantScope,
    createdBy: string,
  ): Promise<SocietyDocument> {
    assertSocietyMatch(societyId, scope);
    const doc = this.documents.create({
      societyId,
      docType: dto.docType,
      fileUrl: dto.fileUrl,
      version: 1,
      createdBy,
      updatedBy: createdBy,
    });
    return this.documents.save(doc);
  }

  /**
   * Bulk CSV import: processes each row independently and reports row-level
   * errors rather than failing the whole batch on one bad row — a 500-row
   * CSV with one typo'd floor number shouldn't force a re-upload of the
   * other 499 good rows. Dedupes by (tower_name, floor_number, flat_number)
   * within the batch itself (§2's "bulk import de-duplication by
   * flat_number" rule), keeping the first occurrence and reporting the rest
   * as skipped.
   */
  async bulkImportFlats(
    societyId: string,
    csvBuffer: Buffer,
    scope: TenantScope,
  ): Promise<BulkImportResult> {
    assertSocietyMatch(societyId, scope);

    const rows: FlatCsvRow[] = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const towerByName = new Map<string, string | null>();
    const seenKeys = new Set<string>();
    const errors: BulkImportRowError[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header is row 1
      const row = rows[i]!;
      const flatNumber = row.flat_number?.trim() || null;

      try {
        if (!flatNumber) {
          throw new Error('flat_number is required');
        }

        const towerName = row.tower_name?.trim() || null;
        const floorNumber = row.floor_number?.trim() ? Number(row.floor_number) : null;
        if (row.floor_number?.trim() && Number.isNaN(floorNumber)) {
          throw new Error(`invalid floor_number "${row.floor_number}"`);
        }

        const dedupeKey = `${towerName ?? ''}::${floorNumber ?? ''}::${flatNumber}`;
        if (seenKeys.has(dedupeKey)) {
          skipped++;
          errors.push({ row: rowNum, flatNumber, error: 'duplicate flat_number within this CSV, skipped' });
          continue;
        }
        seenKeys.add(dedupeKey);

        let towerId: string | null = null;
        if (towerName) {
          if (!towerByName.has(towerName)) {
            const existingTower = await this.flats.manager
              .createQueryBuilder()
              .select('id')
              .from('towers', 'towers')
              .where('society_id = :societyId AND name = :name', { societyId, name: towerName })
              .getRawOne<{ id: string }>();
            towerByName.set(towerName, existingTower?.id ?? null);
          }
          towerId = towerByName.get(towerName) ?? null;
          if (!towerId) {
            throw new Error(`unknown tower_name "${towerName}"`);
          }
        }

        const existingFlat = await this.flats.findOne({
          where: {
            societyId,
            towerId: towerId ?? IsNull(),
            floorNumber: floorNumber ?? IsNull(),
            flatNumber,
          },
        });
        if (existingFlat) {
          throw new Error('flat_number already exists for this society/tower/floor');
        }

        const flat = this.flats.create({
          societyId,
          towerId,
          floorNumber,
          flatNumber,
          type: row.type?.trim() || null,
          areaSqft: row.area_sqft?.trim() || null,
          status: 'vacant',
        });
        await this.flats.save(flat);
        imported++;
      } catch (err) {
        skipped++;
        errors.push({
          row: rowNum,
          flatNumber,
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    return { imported, skipped, errors };
  }
}
