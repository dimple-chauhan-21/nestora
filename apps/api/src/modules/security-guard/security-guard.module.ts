import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Guard } from '../../database/entities/guard.entity';
import { Gate } from '../../database/entities/gate.entity';
import { GateLog } from '../../database/entities/gate-log.entity';
import { EmergencyAlert } from '../../database/entities/emergency-alert.entity';
import { ShiftReport } from '../../database/entities/shift-report.entity';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { Resident } from '../../database/entities/resident.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Delivery } from '../../database/entities/delivery.entity';

import { AuthModule } from '../auth/auth.module';
import { VisitorModule } from '../visitor/visitor.module';
import { ParkingModule } from '../parking/parking.module';
import { NotificationModule } from '../notification/notification.module';

import { GuardController, GateCallController } from './guard.controller';
import { GateController } from './gate.controller';
import { EmergencyAlertController } from './emergency-alert.controller';
import { GuardService } from './guard.service';
import { GateService } from './gate.service';
import { EmergencyAlertService } from './emergency-alert.service';
import { GuardContextService } from './guard-context.service';

@Module({
  imports: [
    AuthModule,
    VisitorModule,
    ParkingModule,
    NotificationModule,
    TenantScopedTypeOrmModule.forFeature([Guard, Gate, GateLog, EmergencyAlert, ShiftReport, VisitorVisit, Resident, Flat, Delivery]),
  ],
  controllers: [GuardController, GateCallController, GateController, EmergencyAlertController],
  providers: [GuardService, GateService, EmergencyAlertService, GuardContextService],
  exports: [GuardContextService, GateService],
})
export class SecurityGuardModule {}
