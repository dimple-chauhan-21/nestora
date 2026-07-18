import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Notice } from '../../database/entities/notice.entity';
import { NoticeAttachment } from '../../database/entities/notice-attachment.entity';
import { NoticeRead } from '../../database/entities/notice-read.entity';
import { UserRole } from '../../database/entities/user-role.entity';

import { NoticeBoardController } from './notice-board.controller';
import { NoticeBoardService } from './notice-board.service';

@Module({
  imports: [TenantScopedTypeOrmModule.forFeature([Notice, NoticeAttachment, NoticeRead, UserRole])],
  controllers: [NoticeBoardController],
  providers: [NoticeBoardService],
  exports: [NoticeBoardService],
})
export class NoticeBoardModule {}
