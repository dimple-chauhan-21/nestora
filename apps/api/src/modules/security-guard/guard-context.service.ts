import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guard } from '../../database/entities/guard.entity';

/**
 * Resolves a guard's row (and current gate assignment) fresh from the DB on
 * every call — deliberately not cached in the JWT. See gate-scope.util.ts's
 * comment for why: a guard's gate can be reassigned between requests, and a
 * stale JWT claim would let them keep acting on a gate they've been moved
 * off of until token expiry.
 */
@Injectable()
export class GuardContextService {
  constructor(@InjectRepository(Guard) private readonly guards: Repository<Guard>) {}

  async resolveOrThrow(userId: string): Promise<Guard> {
    const guard = await this.guards.findOne({ where: { userId } });
    if (!guard) throw new ForbiddenException('User is not a registered guard');
    return guard;
  }

  /** The explicit gate-switch action — see gate-scope.util.ts. */
  async assignGate(guard: Guard, gateId: string): Promise<Guard> {
    guard.gateId = gateId;
    return this.guards.save(guard);
  }
}
