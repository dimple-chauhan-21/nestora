import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from '../../database/entities/asset.entity';
import { AssetMaintenanceLog } from '../../database/entities/asset-maintenance-log.entity';
import { CLOCK, type Clock } from '../../common/clock';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto';

const WARRANTY_ALERT_THRESHOLD_DAYS = 30;

export interface WarrantyAlert {
  assetId: string;
  warrantyExpiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

/**
 * Pure function, no DB dependency — deliverable #6's unit-test target.
 * `daysUntilExpiry` is negative once expired (not clamped to 0) so callers
 * can distinguish "expires in 3 days" from "expired 3 days ago" instead of
 * both reading as edge cases of the same number.
 */
export function computeWarrantyAlert(
  assetId: string,
  warrantyExpiresAt: string | null,
  now: Date,
  thresholdDays: number = WARRANTY_ALERT_THRESHOLD_DAYS,
): WarrantyAlert {
  if (!warrantyExpiresAt) {
    return { assetId, warrantyExpiresAt: null, daysUntilExpiry: null, isExpired: false, isExpiringSoon: false };
  }
  const expiryDate = new Date(`${warrantyExpiresAt}T00:00:00.000Z`);
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysUntilExpiry = Math.round((expiryDate.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000));

  return {
    assetId,
    warrantyExpiresAt,
    daysUntilExpiry,
    isExpired: daysUntilExpiry < 0,
    isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= thresholdDays,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(AssetMaintenanceLog) private readonly maintenanceLog: Repository<AssetMaintenanceLog>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createAsset(dto: CreateAssetDto, scope: TenantScope, actorId: string): Promise<Asset> {
    if (scope.isPlatformScope || !scope.societyId) {
      throw new NotFoundException('A society-scoped caller is required to register an asset');
    }
    const asset = this.assets.create({
      societyId: scope.societyId,
      name: dto.name,
      category: dto.category ?? null,
      purchaseDate: dto.purchaseDate ?? null,
      purchaseCost: dto.purchaseCost !== undefined ? String(dto.purchaseCost) : null,
      vendor: dto.vendor ?? null,
      warrantyExpiresAt: dto.warrantyExpiresAt ?? null,
      assignedToStaffId: dto.assignedToStaffId ?? null,
      assignedToLocation: dto.assignedToLocation ?? null,
      status: 'active',
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.assets.save(asset);
  }

  private async loadAssetOrThrow(assetId: string): Promise<Asset> {
    const asset = await this.assets.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async createMaintenanceLog(
    assetId: string,
    dto: CreateMaintenanceLogDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<AssetMaintenanceLog> {
    const asset = await this.loadAssetOrThrow(assetId);
    assertSocietyMatch(asset.societyId, scope);

    const entry = this.maintenanceLog.create({
      societyId: asset.societyId,
      assetId,
      serviceDate: dto.serviceDate,
      cost: dto.cost !== undefined ? String(dto.cost) : null,
      vendor: dto.vendor ?? null,
      notes: dto.notes ?? null,
      createdBy: actorId,
    });
    return this.maintenanceLog.save(entry);
  }

  async listForSociety(societyId: string, category: string | undefined, scope: TenantScope): Promise<Asset[]> {
    assertSocietyMatch(societyId, scope);
    const where: { societyId: string; category?: string } = { societyId };
    if (category) where.category = category;
    return this.assets.find({ where, order: { createdAt: 'DESC' } });
  }

  async getWarrantyAlert(assetId: string, scope: TenantScope): Promise<WarrantyAlert> {
    const asset = await this.loadAssetOrThrow(assetId);
    assertSocietyMatch(asset.societyId, scope);
    return computeWarrantyAlert(asset.id, asset.warrantyExpiresAt, this.clock.now());
  }
}
