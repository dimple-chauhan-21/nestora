import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Payment } from '../../../database/entities/payment.entity';
import { loadEnv } from '../../../config/env.validation';
import type { PaymentGatewayProvider, PaymentSession } from './payment-gateway-provider.interface';

const env = loadEnv();

/**
 * Stub — no real Razorpay account/credentials exist (see conversation: we
 * can't create one, and even sandbox mode needs real keys). Simulates the
 * *shape* of a real gateway integration closely enough that the webhook
 * verification code downstream is exercised for real:
 *
 * - `createSession` mints a Razorpay-shaped order ref and pre-creates a
 *   `pending` payments row keyed on it (a real gateway session creation
 *   would do the equivalent server-side before redirecting the payer).
 * - `signWebhookPayload` reproduces Razorpay's actual webhook scheme:
 *   HMAC-SHA256 over the raw body bytes, hex-encoded, using a shared
 *   secret configured once (here: PAYMENT_GATEWAY_WEBHOOK_SECRET). A real
 *   gateway calls this same computation server-side before POSTing to your
 *   webhook URL; here, since nothing external is actually calling us,
 *   tests use this method to construct realistically-signed (and
 *   deliberately mis-signed) webhook requests.
 */
@Injectable()
export class StubPaymentGatewayProvider implements PaymentGatewayProvider {
  private readonly logger = new Logger(StubPaymentGatewayProvider.name);

  constructor(@InjectRepository(Payment) private readonly payments: Repository<Payment>) {}

  async createSession(input: {
    societyId: string;
    billId: string;
    amount: string;
    currency: string;
  }): Promise<PaymentSession> {
    const gatewayRef = `order_${randomUUID().replace(/-/g, '').slice(0, 18)}`;

    const payment = this.payments.create({
      societyId: input.societyId,
      billId: input.billId,
      amount: input.amount,
      currency: input.currency,
      method: 'online',
      gatewayRef,
      status: 'pending',
    });
    await this.payments.save(payment);

    this.logger.log(
      `[gateway] session created gatewayRef=${gatewayRef} billId=${input.billId} amount=${input.amount}`,
    );

    return {
      gatewayRef,
      checkoutUrl: `https://stub-gateway.invalid/checkout/${gatewayRef}`,
    };
  }

  signWebhookPayload(rawBody: Buffer): string {
    return createHmac('sha256', env.PAYMENT_GATEWAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = this.signWebhookPayload(rawBody);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
