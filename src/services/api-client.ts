import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getCurrentUserToken } from './auth-service';

export const PRODUCTION_API_URL = 'https://expense-tracker-3uoa.onrender.com/api/v1';

/**
 * Checks if a hostname or IP string represents a local or private address:
 * - localhost
 * - 127.0.0.0/8 (Loopback)
 * - 10.0.0.0/8 (Class A private: 10.0.0.0 - 10.255.255.255)
 * - 172.16.0.0/12 (Class B private: 172.16.0.0 - 172.31.255.255)
 * - 192.168.0.0/16 (Class C private: 192.168.0.0 - 192.168.255.255)
 */
export function isLocalOrPrivateAddress(hostnameOrUrl: string): boolean {
  if (!hostnameOrUrl || typeof hostnameOrUrl !== 'string') {
    return false;
  }

  let hostname = hostnameOrUrl.trim().toLowerCase();

  // If a full URL is passed, extract the hostname safely
  try {
    const parsed = new URL(hostname.includes('://') ? hostname : `http://${hostname}`);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    // If URL parsing fails, extract host segment manually
    hostname = hostname.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].trim();
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return true;
  }

  // Check IPv4 pattern: 4 numeric octets separated by dots
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const [, o1Str, o2Str, o3Str, o4Str] = ipv4Match;
  const o1 = parseInt(o1Str, 10);
  const o2 = parseInt(o2Str, 10);
  const o3 = parseInt(o3Str, 10);
  const o4 = parseInt(o4Str, 10);

  if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
    return false;
  }

  // 127.0.0.0/8 (Loopback)
  if (o1 === 127) {
    return true;
  }

  // 10.0.0.0/8 (Class A private network)
  if (o1 === 10) {
    return true;
  }

  // 172.16.0.0/12 (Class B private network: 172.16.0.0 - 172.31.255.255)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) {
    return true;
  }

  // 192.168.0.0/16 (Class C private network: 192.168.0.0 - 192.168.255.255)
  if (o1 === 192 && o2 === 168) {
    return true;
  }

  return false;
}

/**
 * Resolves the API base URL dynamically:
 * 1. Explicit EXPO_PUBLIC_API_URL environment variable (highest priority)
 *    - In release builds, local/private addresses are rejected and fallback to PRODUCTION_API_URL
 * 2. On Web platform (dev): defaults to 'http://localhost:5000/api/v1'
 * 3. On Native in Expo Go (dev only): dynamically extracts dev host IP from Metro hostUri
 * 4. In release builds: defaults to PRODUCTION_API_URL
 * 5. Fallback: 'http://localhost:5000/api/v1'
 */
export function getApiBaseUrl(): string {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  if (envUrl && envUrl.trim().length > 0) {
    const formattedUrl = envUrl.trim().replace(/\/+$/, '');

    // In release builds, never return a local or private network URL
    if (!isDev && isLocalOrPrivateAddress(formattedUrl)) {
      console.warn(
        `[Spendly API Warning] Running in a release build with local/private API URL (${formattedUrl}). Mobile devices cannot connect outside local network. Falling back to production backend endpoint.`
      );
      return PRODUCTION_API_URL;
    }

    return formattedUrl;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api/v1';
  }

  // On native devices running in Expo Go (dev only), extract laptop/host IP dynamically from hostUri
  if (isDev) {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoClient?.hostUri;

    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
        return `http://${hostIp}:5000/api/v1`;
      }
    }
  }

  if (!isDev) {
    console.warn(
      '[Spendly API Warning] Standalone release build without explicit EXPO_PUBLIC_API_URL set. Falling back to production backend endpoint.'
    );
    return PRODUCTION_API_URL;
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
