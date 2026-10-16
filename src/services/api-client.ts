import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getCurrentUserToken } from './auth-service';

/**
 * Resolves the API base URL dynamically:
 * 1. Explicit EXPO_PUBLIC_API_URL environment variable (highest priority)
 * 2. On Web platform: defaults to 'http://localhost:5000/api/v1'
 * 3. On Native (Android/iOS Expo Go): dynamically extracts dev host IP from Metro hostUri
 * 4. Fallback: 'http://localhost:5000/api/v1'
 */
export function getApiBaseUrl(): string {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    const formattedUrl = envUrl.trim().replace(/\/+$/, '');
    if (!isDev && (formattedUrl.includes('localhost') || formattedUrl.includes('127.0.0.1'))) {
      console.warn(
        '[Spendly API Warning] Running in a release build with localhost API URL. Mobile devices will not be able to connect unless pointing to a reachable production HTTPS backend.'
      );
    }
    return formattedUrl;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api/v1';
  }

  // On native devices running in Expo Go, extract laptop/host IP dynamically from hostUri
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:5000/api/v1`;
    }
  }

  if (!isDev) {
    console.warn(
      '[Spendly API Warning] Standalone release build without explicit EXPO_PUBLIC_API_URL set. Falling back to production backend endpoint.'
    );
    return 'https://expense-tracker-3uoa.onrender.com/api/v1';
  }

  return 'http://localhost:5000/api/v1';
}

export class ApiError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code = 'API_ERROR', statusCode = 400, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getCurrentUserToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError(
        `Request timed out after 15 seconds. Please check your network connection and verify the server is reachable.`,
        'TIMEOUT_ERROR',
        408
      );
    }
    const errorMsg = `Unable to connect to server at ${baseUrl}. Please check that the backend server is running and accessible on your network.`;
    console.warn(
      `[API Client] Network request failed for [${cleanEndpoint}] to ${baseUrl}:`,
      err?.message || 'Network request failed'
    );
    throw new ApiError(errorMsg, 'NETWORK_ERROR', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorInfo = data?.error;
    let message = errorInfo?.message || `Request failed with status ${response.status}`;
    if (
      Array.isArray(errorInfo?.details) &&
      errorInfo.details.length > 0 &&
      !message.includes(':')
    ) {
      const detailsStr = errorInfo.details
        .map((d: any) => (d.field ? `${d.field}: ${d.message}` : d.message || String(d)))
        .join(', ');
      message = `${message}: ${detailsStr}`;
    }

    throw new ApiError(
      message,
      errorInfo?.code || 'REQUEST_FAILED',
      response.status,
      errorInfo?.details
    );
  }

  return data as T;
}
