const imageTool = require('../../src/tools/image_generation');
const videoTool = require('../../src/tools/video_generation');

describe('MiniMax media provider auto-routing', () => {
  const config = { providerUrl: 'https://api.minimax.io/v1', providerApiKey: 'same-key' };

  it('selects MiniMax image-01 without an extra image key', () => {
    expect(imageTool.selectImageProvider(config)).toBe('minimax');
  });

  it('selects MiniMax Hailuo without an extra video key', () => {
    expect(videoTool.selectVideoProvider(config)).toBe('minimax');
  });

  it('respects explicit provider overrides', () => {
    expect(imageTool.selectImageProvider(config, { provider: 'pollinations' })).toBe('pollinations');
    expect(videoTool.selectVideoProvider(config, { provider: 'runway' })).toBe('runway');
  });
});
