export interface PaymentSession {
  gatewayRef: string;
  checkoutUrl: string;
}

export interface PaymentGatewayProvider {
  createSession(input: {
    societyId: string;
    billId: string;
    amount: string;
    currency: string;
  }): Promise<PaymentSession>;
}

export const PAYMENT_GATEWAY_PROVIDER = Symbol('PAYMENT_GATEWAY_PROVIDER');
