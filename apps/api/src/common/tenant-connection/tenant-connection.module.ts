import { Global, Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';

/**
 * @Global so every module's TenantScopedTypeOrmModule.forFeature() can
 * inject TenantConnectionService without each one separately importing this
 * module — same reasoning TypeOrmCoreModule itself is global for DataSource.
 * Imported exactly once, from AppModule.
 */
@Global()
@Module({
  providers: [TenantConnectionService],
  exports: [TenantConnectionService],
})
export class TenantConnectionModule {}
