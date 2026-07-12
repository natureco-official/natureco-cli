const { evaluatePolicyDecision } = require('../../src/utils/tool-runner');

describe('tool runner configured policy decisions', () => {
  const allow = { action: 'allow' };

  test('deny wins over allow and ask', () => {
    expect(evaluatePolicyDecision({ action: 'ask' }, { action: 'deny', reason: 'blocked' }, { agentMode: true }))
      .toEqual({ allowed: false, needsApproval: false, reason: 'blocked' });
  });

  test('ask fails closed for non-interactive origins', () => {
    expect(evaluatePolicyDecision({ action: 'ask', reason: 'review' }, allow))
      .toEqual({ allowed: false, needsApproval: true, reason: 'review' });
  });

  test('ask routes to interactive approval or explicit preapproval', () => {
    expect(evaluatePolicyDecision({ action: 'ask', reason: 'review' }, allow, { agentMode: true }))
      .toEqual({ allowed: true, needsApproval: true, reason: 'review' });
    expect(evaluatePolicyDecision({ action: 'ask' }, allow, { approvalMode: 'preapproved' }))
      .toEqual({ allowed: true, needsApproval: false });
  });

  test('allow proceeds without approval', () => {
    expect(evaluatePolicyDecision(allow, allow)).toEqual({ allowed: true, needsApproval: false });
  });
});
