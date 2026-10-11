import { getApiBaseUrl, apiRequest, ApiError } from '../src/services/api-client';
import * as authService from '../src/services/auth-service';
import { Platform } from 'react-native';

describe('API Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getApiBaseUrl', () => {
    test('uses EXPO_PUBLIC_API_URL when explicitly set', () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.100:5000/api/v1/';
      const url = getApiBaseUrl();
      expect(url).toBe('http://192.168.1.100:5000/api/v1');
    });

    test('falls back to localhost:5000 on web platform when EXPO_PUBLIC_API_URL is unset', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      Platform.OS = 'web';
      const url = getApiBaseUrl();
      expect(url).toBe('http://localhost:5000/api/v1');
    });
  });

  describe('apiRequest error handling', () => {
    test('throws ApiError with clear base URL and diagnostic hint on network failure', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.50:5000/api/v1';

      // Mock fetch to simulate network error (e.g. connection refused)
      globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

      await expect(apiRequest('/rooms')).rejects.toThrow(ApiError);
      await expect(apiRequest('/rooms')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        statusCode: 0,
        message: expect.stringContaining('Unable to connect to server at http://192.168.1.50:5000/api/v1'),
      });
    });

    test('injects Authorization bearer header when user is authenticated', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000/api/v1';
      jest.spyOn(authService, 'getCurrentUserToken').mockResolvedValue('mock-id-token-123');

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const result = await apiRequest<{ success: boolean }>('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-id-token-123',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    test('throws ApiError with TIMEOUT_ERROR when request is aborted due to timeout', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000/api/v1';

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(apiRequest('/slow-endpoint')).rejects.toMatchObject({
        code: 'TIMEOUT_ERROR',
        statusCode: 408,
        message: expect.stringContaining('timed out after 15 seconds'),
      });
    });
  });
});
