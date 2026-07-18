import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Complaint } from '../../database/entities/complaint.entity';
import { ComplaintCategory } from '../../database/entities/complaint-category.entity';
import { ComplaintAttachment } from '../../database/entities/complaint-attachment.entity';
import { ComplaintComment } from '../../database/entities/complaint-comment.entity';
import { ComplaintEscalation } from '../../database/entities/complaint-escalation.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { Flat } from '../../database/entities/flat.entity';

import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';
import { ComplaintEscalationScheduler } from './complaint-escalation.scheduler';

import { NotificationModule } from '../notification/notification.module';
import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([
      Complaint,
      ComplaintCategory,
      ComplaintAttachment,
      ComplaintComment,
      ComplaintEscalation,
      UserRole,
      Flat,
    ]),
    NotificationModule,
  ],
  controllers: [ComplaintController],
  providers: [ComplaintService, ComplaintEscalationScheduler, { provide: CLOCK, useClass: SystemClock }],
  exports: [ComplaintService],
})
export class ComplaintModule {}
