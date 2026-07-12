const { prepareConversationHistory } = require('../../src/utils/conversation-context');

describe('prepareConversationHistory', () => {
  it('keeps prior user and assistant turns for workflow follow-ups', () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'Create city-drive-3d.html' },
      { role: 'assistant', content: 'Created city-drive-3d.html' },
      { role: 'tool', content: 'large internal result' },
    ];

    expect(prepareConversationHistory(messages)).toEqual([
      { role: 'user', content: 'Create city-drive-3d.html' },
      { role: 'assistant', content: 'Created city-drive-3d.html' },
    ]);
  });

  it('drops empty content and bounds context to the newest turns', () => {
    const messages = [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'recent user' },
      { role: 'assistant', content: 'recent assistant' },
    ];

    expect(prepareConversationHistory(messages, { maxMessages: 2, maxTokens: 100 })).toEqual([
      { role: 'user', content: 'recent user' },
      { role: 'assistant', content: 'recent assistant' },
    ]);
  });

  it('truncates an oversized newest response to the token budget', () => {
    const result = prepareConversationHistory([
      { role: 'assistant', content: 'x'.repeat(4000) },
    ], { maxTokens: 100 });

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('context truncated');
    expect(result[0].content.length).toBeLessThanOrEqual(400);
  });

  it('prefers recent turns when the token budget is exhausted', () => {
    const result = prepareConversationHistory([
      { role: 'user', content: 'old context '.repeat(100) },
      { role: 'user', content: 'the game freezes' },
      { role: 'assistant', content: 'I will optimize the game' },
    ], { maxTokens: 30 });

    expect(result.map(message => message.content)).toEqual([
      'the game freezes',
      'I will optimize the game',
    ]);
  });
});
