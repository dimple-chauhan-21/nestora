import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComplaintService } from './complaint.service';
import { TenantConnectionService } from '../../common/tenant-connection/tenant-connection.service';
import { CLOCK, type Clock } from '../../common/clock';

/**
 * The real, time-guaranteed SLA-breach trigger — unlike visitor escalation
 * or billing's late-fee sweep (both "fire as a side effect of a real read
 * endpoint"), complaint SLA escalation exists specifically to notify someone
 * *before* they'd otherwise notice, so it can't depend on someone opening
 * the queue first. This is this codebase's first genuine `@nestjs/schedule`
 * cron job — every 5 minutes, independent of any HTTP request.
 *
 * Named explicitly so integration tests can fetch this exact job from
 * `SchedulerRegistry` and fire it via the registry/CronJob's own API
 * (`fireOnTick()`) — proving the job is registered and callable through the
 * scheduler, not just that `ComplaintService.escalateOverdueComplaints`
 * works in isolation.
 */
export const COMPLAINT_SLA_ESCALATION_CRON_NAME = 'complaint-sla-escalation-sweep';

@Injectable()
export class ComplaintEscalationScheduler {
  private readonly logger = new Logger(ComplaintEscalationScheduler.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * `ComplaintService` is (transitively) request-scoped now — it injects
   * `@InjectRepository(Complaint)` etc., which TenantScopedTypeOrmModule
   * binds through TenantConnectionService. This scheduler is a singleton
   * with no HTTP request (a cron tick isn't one), so it can't just inject
   * ComplaintService in its constructor — Nest would reject a singleton
   * depending on a request-scoped provider.
   *
   * `ModuleRef.resolve()` with a manually created context id is Nest's own
   * documented answer for exactly this ("using request-scoped providers
   * outside an HTTP request", e.g. from a cron job or a queue consumer).
   * `registerRequestByContextId()` below is a placeholder object, not
   * actually read by anything — TenantConnectionService no longer reads
   * `request.tenantScope` itself (see its own comment for why: by the time
   * a real HTTP request's DI sub-tree gets built, guards/interceptors
   * haven't run yet either), it's registered purely to satisfy
   * TenantConnectionService's `@Inject(REQUEST)` constructor dependency,
   * which Nest needs SOMETHING present for even though this path never
   * uses it. The actual scope is applied explicitly below via
   * `applyScope()`, the same call TenantScopeInterceptor makes for a real
   * request. `isPlatformScope: true` is deliberate — the sweep spans every
   * society (`societyId: null`), which needs `complaints`' and
   * `complaint_escalations`' platform-scope RLS bypass (migration
   * 1700000000020), the same mechanism WebhookService uses for its own
   * cross-society lookup.
   *
   * Unlike a real HTTP request, there's no TenantScopeInterceptor pass
   * running for this synthetic context to commit the transaction it opens.
   * Resolving TenantConnectionService against the SAME contextId gives back
   * the exact instance ComplaintService's repositories are using (Nest
   * caches scoped-provider instances per contextId), so it can be
   * committed/rolled back explicitly here instead.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: COMPLAINT_SLA_ESCALATION_CRON_NAME })
  async sweep(): Promise<void> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId({}, contextId);
    const complaintService = await this.moduleRef.resolve(ComplaintService, contextId, { strict: false });
    const tenantConn = await this.moduleRef.resolve(TenantConnectionService, contextId, { strict: false });

    try {
      await tenantConn.applyScope({ societyId: null, isPlatformScope: true }, null);
      const escalated = await complaintService.escalateOverdueComplaints(null, this.clock.now());
      await tenantConn.commit();
      if (escalated > 0) {
        this.logger.log(`SLA escalation sweep: escalated ${escalated} complaint(s)`);
      }
    } catch (err) {
      await tenantConn.rollback();
      throw err;
    }
  }
}
