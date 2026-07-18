import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { TenantConnectionService } from '../../common/tenant-connection/tenant-connection.service';
import { AmenityMaster } from '../../database/entities/amenity-master.entity';
import { AmenityBookingRule } from '../../database/entities/amenity-booking-rule.entity';
import { Flat } from '../../database/entities/flat.entity';
import { CLOCK, type Clock } from '../../common/clock';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateBookingRuleDto } from './dto/create-booking-rule.dto';

export interface BookingView {
  id: string;
  societyId: string;
  amenityId: string;
  flatId: string;
  bookedBy: string;
  startAt: Date;
  endAt: Date;
  status: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

type RawBookingRow = Record<string, unknown>;

/** Postgres SQLSTATE codes — see AmenityBookingService.createBooking's catch block for why these two are distinguished, not treated as the same "conflict." */
const PG_UNIQUE_VIOLATION = '23505';
const PG_EXCLUSION_VIOLATION = '23P01';
const IDEMPOTENCY_KEY_CONSTRAINT = 'uq_amenity_bookings_idempotency_key';

/**
 * Pure, no DB dependency — `rule`/`startAt`/`endAt`/`now` are the only
 * inputs, no client-supplied override for any of these bounds exists
 * anywhere in the call chain (deliverable #6's unit-test target).
 */
export function validateBookingWindow(rule: AmenityBookingRule, startAt: Date, endAt: Date, now: Date): void {
  if (endAt <= startAt) {
    throw new BadRequestException('endAt must be after startAt');
  }
  const durationMins = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (durationMins < rule.minDurationMins) {
    throw new BadRequestException(
      `Booking duration ${durationMins}min is below the minimum ${rule.minDurationMins}min for this amenity`,
    );
  }
  if (durationMins > rule.maxDurationMins) {
    throw new BadRequestException(
      `Booking duration ${durationMins}min exceeds the maximum ${rule.maxDurationMins}min for this amenity`,
    );
  }
  if (startAt < now) {
    throw new BadRequestException('Cannot book a slot in the past');
  }
  const advanceLimit = new Date(now.getTime() + rule.advanceBookingDays * 24 * 60 * 60 * 1000);
  if (startAt > advanceLimit) {
    throw new BadRequestException(`Cannot book more than ${rule.advanceBookingDays} day(s) in advance for this amenity`);
  }
}

function mapRow(row: Record<string, unknown>): BookingView {
  return {
    id: row.id as string,
    societyId: row.society_id as string,
    amenityId: row.amenity_id as string,
    flatId: row.flat_id as string,
    bookedBy: row.booked_by as string,
    startAt: new Date(row.start_at as string),
    endAt: new Date(row.end_at as string),
    status: row.status as string,
    idempotencyKey: row.idempotency_key as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

@Injectable()
export class AmenityBookingService {
  constructor(
    private readonly tenantConn: TenantConnectionService,
    @InjectRepository(AmenityMaster) private readonly amenities: Repository<AmenityMaster>,
    @InjectRepository(AmenityBookingRule) private readonly rules: Repository<AmenityBookingRule>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createRule(dto: CreateBookingRuleDto, scope: TenantScope, actorId: string): Promise<AmenityBookingRule> {
    const amenity = await this.amenities.findOne({ where: { id: dto.amenityId } });
    if (!amenity) throw new NotFoundException('Amenity not found');
    assertSocietyMatch(amenity.societyId, scope);

    const rule = this.rules.create({
      societyId: amenity.societyId,
      amenityId: dto.amenityId,
      minDurationMins: dto.minDurationMins,
      maxDurationMins: dto.maxDurationMins,
      advanceBookingDays: dto.advanceBookingDays ?? 7,
      cancellationWindowHours: dto.cancellationWindowHours ?? 24,
      feeAmount: dto.feeAmount !== undefined ? String(dto.feeAmount) : '0',
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.rules.save(rule);
  }

  private async loadAmenityOrThrow(amenityId: string): Promise<AmenityMaster> {
    const amenity = await this.amenities.findOne({ where: { id: amenityId } });
    if (!amenity) throw new NotFoundException('Amenity not found');
    return amenity;
  }

  private async loadRuleOrThrow(amenityId: string): Promise<AmenityBookingRule> {
    const rule = await this.rules.findOne({ where: { amenityId } });
    if (!rule) throw new NotFoundException('No booking rule configured for this amenity');
    return rule;
  }

  async getAvailability(amenityId: string, date: string, scope: TenantScope): Promise<BookingView[]> {
    const amenity = await this.loadAmenityOrThrow(amenityId);
    assertSocietyMatch(amenity.societyId, scope);

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const rows = await this.tenantConn.query<RawBookingRow[]>(
      `SELECT id, society_id, amenity_id, flat_id, booked_by,
              lower(slot) AS start_at, upper(slot) AS end_at,
              status, idempotency_key, created_at, updated_at
       FROM amenity_bookings
       WHERE amenity_id = $1 AND status = 'confirmed' AND slot && tstzrange($2, $3, '[)')
       ORDER BY lower(slot)`,
      [amenityId, dayStart.toISOString(), dayEnd.toISOString()],
    );
    return rows.map(mapRow);
  }

  /**
   * The double-booking guarantee is the EXCLUDE constraint on
   * `amenity_bookings`, not this pre-check — this only produces a fast,
   * friendly error for the *overwhelmingly common* non-racing case. Under
   * real concurrency the DB is always the final word: two requests can both
   * pass this check and race to the INSERT, and exactly one of them will
   * hit the exclusion violation below.
   */
  async createBooking(
    amenityId: string,
    dto: CreateBookingDto,
    idempotencyKey: string,
    scope: TenantScope,
    actorId: string,
  ): Promise<BookingView> {
    const amenity = await this.loadAmenityOrThrow(amenityId);
    assertSocietyMatch(amenity.societyId, scope);

    const flat = await this.flats.findOne({ where: { id: dto.flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const rule = await this.loadRuleOrThrow(amenityId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    validateBookingWindow(rule, startAt, endAt, this.clock.now());

    try {
      // In a SAVEPOINT, not directly in the request's outer transaction —
      // a UNIQUE/EXCLUDE violation here is an expected, handled outcome
      // (see the catch block below), not a fatal error. Without the
      // savepoint, Postgres aborts the whole transaction on this failure,
      // and the idempotency-replay SELECT a few lines down would itself
      // fail with "current transaction is aborted" instead of running.
      const rows = await this.tenantConn.withSavepoint<RawBookingRow[]>((qr) =>
        qr.query(
          `INSERT INTO amenity_bookings (society_id, amenity_id, flat_id, booked_by, slot, idempotency_key, status)
           VALUES ($1, $2, $3, $4, tstzrange($5, $6, '[)'), $7, 'confirmed')
           RETURNING id, society_id, amenity_id, flat_id, booked_by,
                     lower(slot) AS start_at, upper(slot) AS end_at,
                     status, idempotency_key, created_at, updated_at`,
          [amenity.societyId, amenityId, dto.flatId, actorId, startAt.toISOString(), endAt.toISOString(), idempotencyKey],
        ),
      );
      return mapRow(rows[0]!); // INSERT ... RETURNING on success always returns exactly one row
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const driverErr = err as unknown as { code?: string; constraint?: string };

        // Expected: client retried the exact same request (double-tap,
        // flaky-connection resubmit) — replay the original booking, not an
        // error. Matched on constraint name too, not just the SQLSTATE,
        // so a coincidental future 23505 on some other constraint doesn't
        // get silently treated as a replay.
        if (driverErr.code === PG_UNIQUE_VIOLATION && driverErr.constraint === IDEMPOTENCY_KEY_CONSTRAINT) {
          const existing = await this.tenantConn.query<RawBookingRow[]>(
            `SELECT id, society_id, amenity_id, flat_id, booked_by,
                    lower(slot) AS start_at, upper(slot) AS end_at,
                    status, idempotency_key, created_at, updated_at
             FROM amenity_bookings WHERE idempotency_key = $1`,
            [idempotencyKey],
          );
          if (existing[0]) return mapRow(existing[0]);
        }

        // Expected: this request genuinely lost the double-booking race —
        // a different idempotency_key, same amenity, overlapping slot. The
        // exclusion constraint (a distinct SQLSTATE from unique_violation)
        // is what makes this a DB-level guarantee, not an app pre-check.
        if (driverErr.code === PG_EXCLUSION_VIOLATION) {
          throw new ConflictException('This amenity is already booked for the requested time slot');
        }
      }

      // Anything else (FK violation, connection error, a 23505 on some
      // other constraint) is unexpected — surface it as-is, never silently
      // reinterpreted as either case above.
      throw err;
    }
  }

  async cancelBooking(bookingId: string, scope: TenantScope): Promise<BookingView> {
    const rows = await this.tenantConn.query<RawBookingRow[]>(
      `SELECT id, society_id, amenity_id, flat_id, booked_by,
              lower(slot) AS start_at, upper(slot) AS end_at,
              status, idempotency_key, created_at, updated_at
       FROM amenity_bookings WHERE id = $1`,
      [bookingId],
    );
    if (!rows[0]) throw new NotFoundException('Booking not found');
    const booking = mapRow(rows[0]);

    assertSocietyMatch(booking.societyId, scope);
    assertFlatMatch(booking.flatId, scope);

    if (booking.status === 'cancelled') return booking; // idempotent no-op

    // Note: unlike INSERT...RETURNING (which resolves to the rows array
    // directly), TypeORM's raw DataSource.query() resolves UPDATE/DELETE
    // ...RETURNING to a [rows, affectedCount] tuple — verified directly
    // against the pg driver, not assumed.
    const [updatedRows] = await this.tenantConn.query<[RawBookingRow[], number]>(
      `UPDATE amenity_bookings SET status = 'cancelled', updated_at = now()
       WHERE id = $1
       RETURNING id, society_id, amenity_id, flat_id, booked_by,
                 lower(slot) AS start_at, upper(slot) AS end_at,
                 status, idempotency_key, created_at, updated_at`,
      [bookingId],
    );
    return mapRow(updatedRows[0]!); // UPDATE ... RETURNING on success always returns exactly one row
  }
}
