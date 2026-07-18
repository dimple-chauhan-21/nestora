import { DynamicModule, Module, Scope } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { TenantConnectionService } from './tenant-connection.service';

/**
 * Drop-in replacement for `TypeOrmModule.forFeature([...entities])`. Every
 * existing `@InjectRepository(Entity)` call site keeps working completely
 * unchanged — this only changes WHAT that token resolves to: instead of a
 * singleton pooled repository, each entity's repository token now resolves
 * (request-scoped, lazily) to `TenantConnectionService.getRepository()`,
 * which shares one real connection/transaction — and therefore one set of
 * `app.current_society_id`/`is_platform_scope`/`current_user_id` session
 * variables — across every repository used within a single request.
 *
 * Nest propagates REQUEST scope transitively: any service (and controller)
 * that depends on one of these tokens becomes request-scoped too. That's a
 * real, accepted throughput cost (a fresh DI sub-tree + a real DB
 * transaction per request, even for a single-row read) — the tradeoff for
 * RLS actually being enforced instead of structurally bypassed. Nest's
 * "durable providers" feature exists specifically to reduce this cost;
 * adopting it is future work, not needed for this session's correctness bar.
 */
@Module({})
export class TenantScopedTypeOrmModule {
  static forFeature(entities: EntityClassOrSchema[]): DynamicModule {
    const providers = entities.map((entity) => ({
      provide: getRepositoryToken(entity),
      scope: Scope.REQUEST,
      inject: [TenantConnectionService],
      useFactory: (tenantConn: TenantConnectionService) => tenantConn.getRepository(entity),
    }));

    return {
      module: TenantScopedTypeOrmModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  }
}
