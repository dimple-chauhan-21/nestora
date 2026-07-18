import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { loadEnv } from './config/env.validation';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { WriteThrottlerGuard } from './common/guards/write-throttler.guard';
import { TenantScopeInterceptor } from './common/interceptors/tenant-scope.interceptor';

import { TenantConnectionModule } from './common/tenant-connection/tenant-connection.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { SocietyModule } from './modules/society/society.module';
import { ResidentModule } from './modules/resident/resident.module';
import { VisitorModule } from './modules/visitor/visitor.module';
import { SecurityGuardModule } from './modules/security-guard/security-guard.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DomesticStaffModule } from './modules/domestic-staff/domestic-staff.module';
import { ComplaintModule } from './modules/complaint/complaint.module';
import { BillingModule } from './modules/billing/billing.module';
import { ParkingModule } from './modules/parking/parking.module';
import { NoticeBoardModule } from './modules/notice-board/notice-board.module';
import { EventModule } from './modules/event/event.module';
import { PollModule } from './modules/poll/poll.module';
import { LostFoundModule } from './modules/lost-found/lost-found.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AmenityBookingModule } from './modules/amenity-booking/amenity-booking.module';
import { WaterTankerModule } from './modules/water-tanker/water-tanker.module';
import { ElectricityModule } from './modules/electricity/electricity.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DocumentModule } from './modules/document/document.module';
import { AuditModule } from './modules/audit/audit.module';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: env.DATABASE_URL,
      // Glob-based discovery, not a manually maintained array — a new
      // `*.entity.ts` file is picked up automatically. Two sessions in a row
      // had a new module's entities missing from a hand-maintained list here
      // (silently: DI resolves fine, only actual queries fail), only caught
      // by integration tests. This makes that class of bug structurally
      // impossible instead of something tests have to keep re-catching.
      entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
      synchronize: false,
      logging: env.NODE_ENV === 'development',
      // Default pg pool max (10) is too small once real concurrent load
      // hits a single request path multiple times per request (e.g. the
      // amenity-booking concurrency test: 10 simultaneous bookings, each
      // doing several sequential lookups before its insert attempt).
      // Postgres's own max_connections (100 in dev/CI) has ample headroom.
      extra: { max: 20 },
    }),
    // Default per-user (per-IP for @Public() write routes) limit on
    // mutating requests — see WriteThrottlerGuard for why writes only and
    // why this tracker, not IP alone.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TenantConnectionModule,
    HealthModule,
    AuthModule,
    SocietyModule,
    ResidentModule,
    VisitorModule,
    SecurityGuardModule,
    DeliveryModule,
    DomesticStaffModule,
    ComplaintModule,
    BillingModule,
    ParkingModule,
    NoticeBoardModule,
    EventModule,
    PollModule,
    LostFoundModule,
    InventoryModule,
    AmenityBookingModule,
    WaterTankerModule,
    ElectricityModule,
    NotificationModule,
    ReportsModule,
    DocumentModule,
    AuditModule,
  ],
  providers: [
    // Every route requires a valid JWT unless individually marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    // Runs last — request.user (from JwtAuthGuard) is already populated by
    // the time this guard's getTracker() reads it.
    { provide: APP_GUARD, useClass: WriteThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
  ],
})
export class AppModule {}
