import { randomUUID } from 'node:crypto';
import { computeWarrantyAlert } from './inventory.service';

const NOW = new Date('2026-03-01T12:00:00.000Z'); // midday, to prove day-truncation doesn't skew results

describe('computeWarrantyAlert — warranty-expiry alert date logic', () => {
  it('returns no alert when warranty_expires_at is null', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, null, NOW);
    expect(alert).toEqual({
      assetId,
      warrantyExpiresAt: null,
      daysUntilExpiry: null,
      isExpired: false,
      isExpiringSoon: false,
    });
  });

  it('flags a warranty expiring within the threshold as expiring soon', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, '2026-03-15', NOW, 30); // 14 days out, threshold 30
    expect(alert.daysUntilExpiry).toBe(14);
    expect(alert.isExpiringSoon).toBe(true);
    expect(alert.isExpired).toBe(false);
  });

  it('does not flag a warranty far beyond the threshold', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, '2026-12-01', NOW, 30); // months out
    expect(alert.isExpiringSoon).toBe(false);
    expect(alert.isExpired).toBe(false);
  });

  it('flags an already-expired warranty as expired, not expiring-soon, with a negative day count', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, '2026-02-01', NOW, 30); // ~28 days in the past
    expect(alert.isExpired).toBe(true);
    expect(alert.isExpiringSoon).toBe(false);
    expect(alert.daysUntilExpiry).toBeLessThan(0);
  });

  it('treats the exact threshold boundary (N days out) as expiring soon, inclusive', () => {
    const assetId = randomUUID();
    // NOW is 2026-03-01; 30 days out lands on 2026-03-31.
    const alert = computeWarrantyAlert(assetId, '2026-03-31', NOW, 30);
    expect(alert.daysUntilExpiry).toBe(30);
    expect(alert.isExpiringSoon).toBe(true);
  });

  it('treats one day past the threshold as not expiring-soon', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, '2026-04-01', NOW, 30); // 31 days out
    expect(alert.daysUntilExpiry).toBe(31);
    expect(alert.isExpiringSoon).toBe(false);
  });

  it('treats expiry today (0 days) as expiring soon, not expired', () => {
    const assetId = randomUUID();
    const alert = computeWarrantyAlert(assetId, '2026-03-01', NOW, 30);
    expect(alert.daysUntilExpiry).toBe(0);
    expect(alert.isExpiringSoon).toBe(true);
    expect(alert.isExpired).toBe(false);
  });
});
