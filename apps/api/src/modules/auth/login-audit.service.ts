import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAudit } from '../../database/entities/login-audit.entity';

@Injectable()
export class LoginAuditService {
  constructor(
    @InjectRepository(LoginAudit)
    private readonly loginAudit: Repository<LoginAudit>,
  ) {}

  async record(entry: {
    userId: string | null;
    channel: 'otp' | 'password' | 'refresh';
    success: boolean;
    failureReason?: string | null;
    ip: string | null;
    device: string | null;
  }): Promise<void> {
    const row = this.loginAudit.create({
      userId: entry.userId,
      channel: entry.channel,
      success: entry.success,
      failureReason: entry.failureReason ?? null,
      ip: entry.ip,
      device: entry.device,
    });
    await this.loginAudit.save(row);
  }
}
