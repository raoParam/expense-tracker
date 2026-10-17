import {
  getApiBaseUrl,
  apiRequest,
  ApiError,
  PRODUCTION_API_URL,
  isLocalOrPrivateAddress,
} from '../src/services/api-client';
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

  describe('isLocalOrPrivateAddress', () => {
    test('identifies localhost and loopback addresses', () => {
      expect(isLocalOrPrivateAddress('localhost')).toBe(true);
      expect(isLocalOrPrivateAddress('http://localhost:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('127.0.0.1')).toBe(true);
      expect(isLocalOrPrivateAddress('http://127.0.0.1:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('127.0.1.1')).toBe(true);
    });

    test('identifies 10.0.0.0/8 private network addresses', () => {
      expect(isLocalOrPrivateAddress('http://10.107.56.210:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('10.0.0.1')).toBe(true);
      expect(isLocalOrPrivateAddress('10.255.255.255')).toBe(true);
    });

    test('identifies 172.16.0.0/12 private network addresses', () => {
      expect(isLocalOrPrivateAddress('http://172.16.0.1:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('http://172.20.10.5:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('172.31.255.255')).toBe(true);
      // Non-private 172.x should be false
      expect(isLocalOrPrivateAddress('172.15.255.255')).toBe(false);
      expect(isLocalOrPrivateAddress('172.32.0.1')).toBe(false);
    });

    test('identifies 192.168.0.0/16 private network addresses', () => {
      expect(isLocalOrPrivateAddress('http://192.168.1.1:5000/api/v1')).toBe(true);
      expect(isLocalOrPrivateAddress('http://192.168.100.50:5000/api/v1')).toBe(true);
      // Non-private 192.x should be false
      expect(isLocalOrPrivateAddress('192.169.1.1')).toBe(false);
    });

    test('returns false for public domains and unrelated hostnames', () => {
      expect(isLocalOrPrivateAddress('https://expense-tracker-3uoa.onrender.com/api/v1')).toBe(false);
      expect(isLocalOrPrivateAddress('https://api.spendly.com')).toBe(false);
      expect(isLocalOrPrivateAddress('https://my10domain.com')).toBe(false);
      expect(isLocalOrPrivateAddress('https://10-server.net')).toBe(false);
      expect(isLocalOrPrivateAddress('8.8.8.8')).toBe(false);
      expect(isLocalOrPrivateAddress('')).toBe(false);
    });
  });

  describe('getApiBaseUrl', () => {
    test('preserves valid production HTTPS URL in release mode', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'https://expense-tracker-3uoa.onrender.com/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe('https://expense-tracker-3uoa.onrender.com/api/v1');
    });

    test('normalizes trailing slashes on production URL', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'https://expense-tracker-3uoa.onrender.com/api/v1///';
      const url = getApiBaseUrl();
      expect(url).toBe('https://expense-tracker-3uoa.onrender.com/api/v1');
    });

    test('rejects localhost in release mode and falls back to production URL', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe(PRODUCTION_API_URL);
    });

    test('rejects 10.0.0.0/8 (including 10.107.56.210) in release mode and falls back to production URL', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'http://10.107.56.210:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe(PRODUCTION_API_URL);
    });

    test('rejects 172.16.0.0/12 in release mode and falls back to production URL', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'http://172.20.10.5:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe(PRODUCTION_API_URL);
    });

    test('rejects 192.168.0.0/16 in release mode and falls back to production URL', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.100:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe(PRODUCTION_API_URL);
    });

    test('allows local private IP in development mode', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.EXPO_PUBLIC_API_URL = 'http://10.107.56.210:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe('http://10.107.56.210:5000/api/v1');
    });

    test('allows localhost in development mode', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000/api/v1';
      const url = getApiBaseUrl();
      expect(url).toBe('http://localhost:5000/api/v1');
    });

    test('falls back to production backend in release mode when EXPO_PUBLIC_API_URL is unset', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      (process.env as any).NODE_ENV = 'production';
      Platform.OS = 'android';
      const url = getApiBaseUrl();
      expect(url).toBe(PRODUCTION_API_URL);
    });

    test('falls back to localhost:5000 on web platform in dev when EXPO_PUBLIC_API_URL is unset', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      (process.env as any).NODE_ENV = 'development';
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
