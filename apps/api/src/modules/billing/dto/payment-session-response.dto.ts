import { ApiProperty } from '@nestjs/swagger';

/**
 * Real shape of what POST /bills/{id}/pay actually returns today — a
 * pending payment session against the stub gateway (see
 * StubPaymentGatewayProvider). `checkoutUrl` deliberately resolves nowhere
 * (`.invalid` TLD, no real Razorpay account exists yet); nothing ever
 * confirms this session automatically. Documented honestly here rather than
 * left undecorated (was previously generating no response schema at all).
 */
export class PaymentSessionResponseDto {
  @ApiProperty()
  gatewayRef!: string;

  @ApiProperty()
  checkoutUrl!: string;
}
