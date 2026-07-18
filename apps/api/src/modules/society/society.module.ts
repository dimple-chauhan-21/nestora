import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Society } from '../../database/entities/society.entity';
import { SocietySettings } from '../../database/entities/society-settings.entity';
import { AmenityMaster } from '../../database/entities/amenity-master.entity';
import { SocietyDocument } from '../../database/entities/society-document.entity';
import { Flat } from '../../database/entities/flat.entity';
import { SocietyController } from './society.controller';
import { SocietyService } from './society.service';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([Society, SocietySettings, AmenityMaster, SocietyDocument, Flat]),
  ],
  controllers: [SocietyController],
  providers: [SocietyService],
  exports: [SocietyService],
})
export class SocietyModule {}
