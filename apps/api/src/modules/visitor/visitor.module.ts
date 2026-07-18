import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Visitor } from '../../database/entities/visitor.entity';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { GuestInvite } from '../../database/entities/guest-invite.entity';
import { VisitorBlacklist } from '../../database/entities/visitor-blacklist.entity';
import { Resident } from '../../database/entities/resident.entity';
import { Flat } from '../../database/entities/flat.entity';

import { VisitController } from './visit.controller';
import { FlatVisitController } from './flat-visit.controller';
import { GuestInviteController } from './guest-invite.controller';
import { VisitApprovalService } from './visit-approval.service';
import { BlacklistService } from './blacklist.service';
import { GuestInviteService } from './guest-invite.service';
import { QrTokenService } from './qr/qr-token.service';
import { NotificationModule } from '../notification/notification.module';
import { CLOCK, SystemClock } from '../../common/clock';

/**
 * `NOTIFICATION_PROVIDER` used to be declared and exported locally here —
 * it's now owned by NotificationModule (see that module's own comment for
 * why). SecurityGuardModule, which used to get NOTIFICATION_PROVIDER
 * transitively through VisitorModule's export, now imports NotificationModule
 * directly instead of relying on this module to pass it through — a
 * pass-through re-export of a single token (as opposed to the whole
 * module) isn't how Nest's module system resolves cleanly, and an
 * explicit direct import is clearer about what SecurityGuardModule
 * actually depends on anyway.
 */
@Module({
  imports: [
    JwtModule.register({}),
    TenantScopedTypeOrmModule.forFeature([Visitor, VisitorVisit, GuestInvite, VisitorBlacklist, Resident, Flat]),
    NotificationModule,
  ],
  controllers: [VisitController, FlatVisitController, GuestInviteController],
  providers: [
    VisitApprovalService,
    BlacklistService,
    GuestInviteService,
    QrTokenService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [VisitApprovalService, BlacklistService, GuestInviteService, QrTokenService, CLOCK],
})
export class VisitorModule {}
