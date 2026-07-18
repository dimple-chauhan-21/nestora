import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisitorBlacklist } from '../../database/entities/visitor-blacklist.entity';

export interface BlacklistCheckInput {
  phone?: string | null;
  name?: string | null;
  idProofNumber?: string | null;
}

/**
 * §4 validation: "blacklist check runs synchronously before any pass is
 * issued" — called both at walk-in creation AND again at approval (a
 * blacklist entry could be added in the window between the two).
 */
@Injectable()
export class BlacklistService {
  constructor(
    @InjectRepository(VisitorBlacklist)
    private readonly blacklist: Repository<VisitorBlacklist>,
  ) {}

  async assertNotBlacklisted(societyId: string, input: BlacklistCheckInput): Promise<void> {
    const qb = this.blacklist
      .createQueryBuilder('bl')
      .where('bl.society_id = :societyId', { societyId })
      .andWhere('bl.deleted_at IS NULL');

    const clauses: string[] = [];
    const params: Record<string, string> = {};
    if (input.phone) {
      clauses.push('bl.phone = :phone');
      params.phone = input.phone;
    }
    if (input.name) {
      clauses.push('bl.name = :name');
      params.name = input.name;
    }
    if (input.idProofNumber) {
      clauses.push('bl.id_proof_number = :idProofNumber');
      params.idProofNumber = input.idProofNumber;
    }
    if (clauses.length === 0) return;

    qb.andWhere(`(${clauses.join(' OR ')})`, params);
    const hit = await qb.getOne();
    if (hit) {
      throw new ForbiddenException(`Blacklisted: ${hit.reason}`);
    }
  }
}
