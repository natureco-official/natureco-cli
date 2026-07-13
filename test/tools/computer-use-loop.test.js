const { executeAction, evaluateCompletionEvidence, resolveVisionConfig, visionCall, parseVisionDecision, validateAction } = require('../../src/tools/computer_use_loop');

describe('computer_use_loop macOS actions', () => {
  it('exposes the action executor for platform regression coverage', () => {
    expect(typeof executeAction).toBe('function');
  });

  it('rejects an unknown action instead of reporting success', () => {
    expect(executeAction('not-real', {})).toEqual({ success: false, error: 'Unknown action: not-real' });
  });

  it('AppleScript calistirmadan eksik koordinat ve metni reddeder', () => {
    expect(executeAction('click', { x: undefined, y: 20 }).error).toContain('numeric x and y');
    expect(executeAction('type', {}).error).toContain('requires text');
    expect(validateAction('keypress', { key: undefined })).toContain('requires key');
  });
});

describe('computer_use_loop vision JSON parsing', () => {
  it('duz ve markdown JSON kararlarini ayristirir', () => {
    expect(parseVisionDecision('{"action":"click","x":10,"y":20}').value.action).toBe('click');
    expect(parseVisionDecision('```json\n{"action":"wait"}\n```').value.action).toBe('wait');
  });

  it('yarim kalmis JSON yanitini throw etmeden retry hatasina cevirir', () => {
    const result = parseVisionDecision('{"action":"type","text":"selam');
    expect(result.success).toBe(false);
    expect(result.error).toContain('truncated JSON');
  });
});

describe('computer_use_loop vision provider selection', () => {
  it('routes MiniMax M2.5 screenshots to the Token Plan VLM using the same key', () => {
    const result = resolveVisionConfig({
      providerUrl: 'https://api.minimax.io/v1', providerApiKey: 'secret', providerModel: 'MiniMax-M2.5',
    });
    expect(result).toEqual({
      success: true, dedicated: false, transport: 'minimax-vlm',
      providerUrl: 'https://api.minimax.io/v1', apiKey: 'secret', model: 'MiniMax-M2.5',
    });
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

describe('MiniMax VLM HTTP contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the Token Plan vision endpoint and existing bearer key', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ content: '{"action":"click","x":10,"y":20}', base_resp: { status_code: 0 } }),
    });
    const reply = await visionCall('https://api.minimax.io/v1', 'same-key', 'MiniMax-M2.5', 'inspect', { base64: 'aGVsbG8=' });
    expect(reply).toContain('click');
    expect(fetchMock).toHaveBeenCalledWith('https://api.minimax.io/v1/coding_plan/vlm', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer same-key' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ prompt: 'inspect', image_url: 'data:image/png;base64,aGVsbG8=' });
  });
});

describe('Anthropic vision HTTP contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses native image blocks and x-api-key authentication', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"action":"done"}' }] }),
    });
    await visionCall('https://api.anthropic.com/v1', 'claude-key', 'claude-sonnet-4', 'inspect', { base64: 'aGVsbG8=' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      headers: expect.objectContaining({ 'x-api-key': 'claude-key' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content[0]).toEqual(expect.objectContaining({ type: 'image', source: expect.objectContaining({ type: 'base64' }) }));
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
