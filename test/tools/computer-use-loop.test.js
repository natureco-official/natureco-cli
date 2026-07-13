const { executeAction, evaluateCompletionEvidence, resolveVisionConfig } = require('../../src/tools/computer_use_loop');

describe('computer_use_loop macOS actions', () => {
  it('exposes the action executor for platform regression coverage', () => {
    expect(typeof executeAction).toBe('function');
  });

  it('rejects an unknown action instead of reporting success', () => {
    expect(executeAction('not-real', {})).toEqual({ success: false, error: 'Unknown action: not-real' });
  });
});

describe('computer_use_loop vision provider selection', () => {
  it('fails closed for MiniMax M2.5 because it cannot inspect screenshots', () => {
    const result = resolveVisionConfig({
      providerUrl: 'https://api.minimax.io/v1', providerApiKey: 'secret', providerModel: 'MiniMax-M2.5',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not support screenshot input');
  });

  it('keeps MiniMax for chat while using a dedicated vision provider', () => {
    expect(resolveVisionConfig({
      providerUrl: 'https://api.minimax.io/v1', providerApiKey: 'chat-key', providerModel: 'MiniMax-M2.5',
      guiVisionProviderUrl: 'https://api.openai.com/v1', guiVisionApiKey: 'vision-key', guiVisionModel: 'gpt-4.1-mini',
    })).toEqual({
      success: true, dedicated: true, providerUrl: 'https://api.openai.com/v1', apiKey: 'vision-key', model: 'gpt-4.1-mini',
    });
  });
});

describe('computer_use_loop completion evidence', () => {
  it('rejects model claims when no GUI mutation occurred', () => {
    expect(evaluateCompletionEvidence({
      mutationCount: 0, initialHash: 'before', currentHash: 'after',
      verification: { verified: true, confidence: 1, evidence: 'claimed' },
    }).verified).toBe(false);
  });

  it('rejects completion when the screen did not change', () => {
    expect(evaluateCompletionEvidence({
      mutationCount: 2, initialHash: 'same', currentHash: 'same',
      verification: { verified: true, confidence: 1, evidence: 'claimed' },
    }).verified).toBe(false);
  });

  it('rejects weak or missing visual evidence', () => {
    expect(evaluateCompletionEvidence({
      mutationCount: 2, initialHash: 'before', currentHash: 'after',
      verification: { verified: true, confidence: 0.5, evidence: '' },
    }).verified).toBe(false);
  });

  it('accepts changed-screen completion only with strong visual evidence', () => {
    expect(evaluateCompletionEvidence({
      mutationCount: 2, initialHash: 'before', currentHash: 'after',
      verification: { verified: true, confidence: 0.95, evidence: 'Message bubble is visible' },
    })).toEqual({ verified: true, confidence: 0.95, evidence: 'Message bubble is visible' });
  });
});
