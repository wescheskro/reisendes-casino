import { storageService } from '../src/services/storage';

describe('Storage Service', () => {
  const testKey = `test/${Date.now()}.txt`;
  const testContent = Buffer.from('hello world');

  it('uploads a file', async () => {
    const url = await storageService.upload(testKey, testContent, 'text/plain');
    expect(url).toContain(testKey);
  });

  it('downloads the file', async () => {
    const data = await storageService.download(testKey);
    expect(data.toString()).toBe('hello world');
  });

  it('deletes the file', async () => {
    await storageService.delete(testKey);
    await expect(storageService.download(testKey)).rejects.toThrow();
  });
});
