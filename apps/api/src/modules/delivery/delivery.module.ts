import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Delivery } from '../../database/entities/delivery.entity';
import { DeliveryAgent } from '../../database/entities/delivery-agent.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { User } from '../../database/entities/user.entity';

import { AuthModule } from '../auth/auth.module';
import { SecurityGuardModule } from '../security-guard/security-guard.module';
import { NotificationModule } from '../notification/notification.module';

import { DeliveryController } from './delivery.controller';
import { FlatDeliveryController } from './flat-delivery.controller';
import { DeliveryService } from './delivery.service';

import { CLOCK, SystemClock } from '../../common/clock';

/**
 * Imports SecurityGuardModule for GuardContextService + GateService (gate
 * log reuse — see DeliveryService's own comment). Deliberately one-directional:
 * SecurityGuardModule does NOT import this module back — GuardService reads
 * pending deliveries via its own direct `Delivery` repository registration
 * instead (same pattern it already uses for Resident/Flat), avoiding a
 * circular module dependency.
 */
@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([Delivery, DeliveryAgent, Flat, Resident, User]),
    AuthModule,
    SecurityGuardModule,
    NotificationModule,
  ],
  controllers: [DeliveryController, FlatDeliveryController],
  providers: [DeliveryService, { provide: CLOCK, useClass: SystemClock }],
  exports: [DeliveryService],
})
export class DeliveryModule {}
