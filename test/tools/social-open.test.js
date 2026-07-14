const social = require('../../src/tools/social_open');

describe('social_open platform homes', () => {
  it('opens plain YouTube requests at YouTube, not a Google fallback search', () => {
    expect(social._test.detectPlatform('youtube')).toEqual({ platform: 'youtube', id: '', url: 'https://www.youtube.com' });
    expect(social._test.detectPlatform('yt')).toEqual({ platform: 'youtube', id: '', url: 'https://www.youtube.com' });
  });
});
