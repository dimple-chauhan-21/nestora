import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { DomesticStaff } from '../../database/entities/domestic-staff.entity';
import { StaffFlatMapping } from '../../database/entities/staff-flat-mapping.entity';
import { StaffAttendance } from '../../database/entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../database/entities/staff-leave-request.entity';
import { Flat } from '../../database/entities/flat.entity';

import { AuditModule } from '../audit/audit.module';

import { DomesticStaffController } from './domestic-staff.controller';
import { DomesticStaffService } from './domestic-staff.service';

import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([
      DomesticStaff,
      StaffFlatMapping,
      StaffAttendance,
      StaffLeaveRequest,
      Flat,
    ]),
    AuditModule,
  ],
  controllers: [DomesticStaffController],
  providers: [DomesticStaffService, { provide: CLOCK, useClass: SystemClock }],
  exports: [DomesticStaffService],
})
export class DomesticStaffModule {}
