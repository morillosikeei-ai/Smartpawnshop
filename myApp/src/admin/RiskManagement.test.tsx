import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskManagement from './RiskManagement';
import { getRiskAlerts, type ApiRiskAlert } from '../services/api';

vi.mock('../services/api', () => ({ getRiskAlerts: vi.fn() }));

const mocked = vi.mocked(getRiskAlerts);

/** ISO timestamp that many days before now, so case ages are tested for real. */
const daysAgo = (count: number) => new Date(Date.now() - count * 86400000).toISOString();

const alert = (overrides: Partial<ApiRiskAlert> & Pick<ApiRiskAlert, 'risk_alerts_id'>): ApiRiskAlert => ({
  item_id: 10,
  risk_level: 'high',
  current_value: 18000,
  loan_amount: 25000,
  triggered_at: daysAgo(1),
  resolved: false,
  item: { items_id: 10, description: '18K gold necklace', category: 'Jewelry', customer: { name: 'Maria Santos' } },
  ...overrides,
});

const ALERTS: ApiRiskAlert[] = [
  // High risk, open past the 14 day review window, so the policy escalates it.
  alert({ risk_alerts_id: 1, triggered_at: daysAgo(20) }),
  alert({ risk_alerts_id: 2, risk_level: 'high', triggered_at: daysAgo(2) }),
  alert({ risk_alerts_id: 3, risk_level: 'medium', current_value: 24000, item: { items_id: 11, description: 'Wristwatch', customer: { name: 'Ben Cruz' } } }),
  alert({ risk_alerts_id: 4, risk_level: 'low', current_value: 40000, resolved: true }),
];

describe('RiskManagement', () => {
  // Cleared rather than reset: every test sets its own implementation, and a
  // reset mock answers the panel's request with undefined before it does.
  beforeEach(() => { mocked.mockClear(); });

  const renderPanel = () =>
    render(<RiskManagement policySaved={false} onSavePolicy={() => undefined} onPolicyEdited={() => undefined} />);

  it('counts open cases by level and by escalation', async () => {
    mocked.mockResolvedValue(ALERTS);
    renderPanel();

    const high = await screen.findByText('High risk cases');
    // Two high-risk alerts are unresolved; the resolved low one is not counted.
    expect(high.previousElementSibling?.textContent).toBe('2');

    expect(screen.getByText('Medium risk cases').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Auto-escalated cases').previousElementSibling?.textContent).toBe('1');
  });

  it('lists the unresolved alerts as cards and every case in the table', async () => {
    mocked.mockResolvedValue(ALERTS);
    const { container } = renderPanel();

    await waitFor(() => expect(container.querySelectorAll('.risk-alert').length).toBe(3));
    expect(container.querySelectorAll('.risk-table tbody tr').length).toBe(4);
    expect(screen.getAllByText('Escalated').length).toBe(1);
    expect(screen.getAllByText('Resolved').length).toBe(1);
  });

  it('says the shop is clear when nothing is unresolved', async () => {
    mocked.mockResolvedValue([alert({ risk_alerts_id: 9, resolved: true })]);
    renderPanel();

    expect(await screen.findByText(/No unresolved risk alerts/)).toBeTruthy();
  });

  it('reports a failed request instead of hanging on the placeholder', async () => {
    // Rejected on call rather than up front, so the panel's catch is attached
    // before the rejection exists and the runner sees no stray rejection.
    mocked.mockImplementation(() => Promise.reject(new Error('Network unavailable.')));
    renderPanel();

    expect(await screen.findByText('Network unavailable.')).toBeTruthy();
  });
});
