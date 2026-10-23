import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NotificationService,
  NOTIFICATION_STORAGE_KEYS,
  NOTIFICATION_CHANNEL_ID,
} from '../src/services/notification-service';
import * as apiClient from '../src/services/api-client';
import { Linking, Platform } from 'react-native';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: {
    MAX: 7,
    HIGH: 6,
    DEFAULT: 5,
  },
  AndroidNotificationPriority: {
    MAX: 'max',
    HIGH: 'high',
    DEFAULT: 'default',
  },
}));

// Mock api-client
jest.mock('../src/services/api-client', () => ({
  apiRequest: jest.fn(),
  PRODUCTION_API_URL: 'https://test.api.com',
}));

describe('Mobile NotificationService Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (Platform as any).OS = 'android';
  });

  describe('Permission Prompting Behavior', () => {
    it('should return false if permissions are already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: 'granted',
        canAskAgain: true,
      });

      const shouldPrompt = await NotificationService.shouldPromptUser();
      expect(shouldPrompt).toBe(false);
    });

    it('should return false if user was already prompted previously (do not nag)', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: true,
      });
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.PROMPT_COMPLETED, 'true');

      const shouldPrompt = await NotificationService.shouldPromptUser();
      expect(shouldPrompt).toBe(false);
    });

    it('should return false if system cannot ask again', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: false,
      });

      const shouldPrompt = await NotificationService.shouldPromptUser();
      expect(shouldPrompt).toBe(false);
    });

    it('should return true on first appropriate launch when permission is not determined/granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'undetermined',
        canAskAgain: true,
      });

      const shouldPrompt = await NotificationService.shouldPromptUser();
      expect(shouldPrompt).toBe(true);
    });
  });

  describe('Permission Request & Token Registration', () => {
    it('should handle permission denied gracefully and mark prompt completed', async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
      });

      const result = await NotificationService.requestPermissionAndRegister('user_123');

      expect(result.granted).toBe(false);
      expect(result.token).toBeNull();

      const promptState = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.PROMPT_COMPLETED);
      expect(promptState).toBe('true');
      expect(apiClient.apiRequest).not.toHaveBeenCalled();
    });

    it('should configure channel, get push token, and register with backend when permission is granted', async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: 'granted',
      });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[mobile_test_123]',
      });
      (apiClient.apiRequest as jest.Mock).mockResolvedValue({ success: true });

      const result = await NotificationService.requestPermissionAndRegister('user_123');

      expect(result.granted).toBe(true);
      expect(result.token).toBe('ExponentPushToken[mobile_test_123]');

      // Verifies channel configured with MAX importance on Android
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        NOTIFICATION_CHANNEL_ID,
        expect.objectContaining({
          name: 'Spendly Alerts',
          importance: 7,
        })
      );

      // Verifies token registered with backend for authenticated user
      expect(apiClient.apiRequest).toHaveBeenCalledWith('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ExponentPushToken[mobile_test_123]',
          platform: 'android',
        }),
      });

      const savedToken = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN);
      expect(savedToken).toBe('ExponentPushToken[mobile_test_123]');

      const registeredUser = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID
      );
      expect(registeredUser).toBe('user_123');
    });

    it('should survive API failure without crashing when registering token', async () => {
      (apiClient.apiRequest as jest.Mock).mockRejectedValue(new Error('Network error'));

      const success = await NotificationService.registerTokenWithBackend('ExponentPushToken[err]');
      expect(success).toBe(false);
    });
  });

  describe('Logout & Account Switching Sync', () => {
    it('should unregister token from backend when user logs out (null)', async () => {
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN,
        'ExponentPushToken[logout_test]'
      );
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, 'user_old');
      (apiClient.apiRequest as jest.Mock).mockResolvedValue({ success: true });

      await NotificationService.syncAuthUserState(null);

      expect(apiClient.apiRequest).toHaveBeenCalledWith('/notifications/device-token', {
        method: 'DELETE',
        body: JSON.stringify({ token: 'ExponentPushToken[logout_test]' }),
        signal: expect.anything(),
      });

      const registeredUser = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID
      );
      expect(registeredUser).toBeNull();
    });

    it('should clear local registration state in finally block even if network fails or device is offline', async () => {
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN,
        'ExponentPushToken[offline_token]'
      );
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, 'user_offline');
      (apiClient.apiRequest as jest.Mock).mockRejectedValue(
        new Error('Network request failed - device offline')
      );

      // Must not throw out to caller
      await expect(NotificationService.unregisterTokenFromBackend()).resolves.not.toThrow();

      // Local state MUST be cleaned up so next user does not reuse previous session
      const registeredUser = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID
      );
      expect(registeredUser).toBeNull();
    });

    it('should register token for new user on login or account switch', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: 'granted',
      });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN,
        'ExponentPushToken[switch_user_token]'
      );
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, 'user_old');
      (apiClient.apiRequest as jest.Mock).mockResolvedValue({ success: true });

      await NotificationService.syncAuthUserState('user_new');

      expect(apiClient.apiRequest).toHaveBeenCalledWith('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ExponentPushToken[switch_user_token]',
          platform: 'android',
        }),
      });

      const registeredUser = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID
      );
      expect(registeredUser).toBe('user_new');
    });

    it('should prevent previous account token reuse by clearing local registered user and registering new user upon account switch', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: 'granted',
      });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN,
        'ExponentPushToken[shared_device_token]'
      );
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, 'user_account_a');
      (apiClient.apiRequest as jest.Mock).mockResolvedValue({ success: true });

      // User A logs out
      await NotificationService.unregisterTokenFromBackend();
      expect(await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID)).toBeNull();

      // User B logs in on same device
      await NotificationService.syncAuthUserState('user_account_b');

      expect(apiClient.apiRequest).toHaveBeenCalledWith('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ExponentPushToken[shared_device_token]',
          platform: 'android',
        }),
      });
      expect(await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID)).toBe(
        'user_account_b'
      );

      // Re-invoking sync with same user should not trigger redundant registration
      (apiClient.apiRequest as jest.Mock).mockClear();
      await NotificationService.syncAuthUserState('user_account_b');
      expect(apiClient.apiRequest).not.toHaveBeenCalled();
    });
  });

  describe('Notification Tap Routing', () => {
    it('registers acknowledgement and mandatory-reason rejection actions', async () => {
      await NotificationService.configureExpenseActions();
      expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
        'expense_acknowledgement',
        expect.arrayContaining([
          expect.objectContaining({ identifier: 'expense_acknowledge', buttonTitle: 'Acknowledge' }),
          expect.objectContaining({
            identifier: 'expense_reject',
            buttonTitle: 'Reject',
            textInput: expect.objectContaining({ submitButtonTitle: 'Reject' }),
          }),
        ])
      );
    });

    it('should route to expense detail screen when expenseId is present in payload', () => {
      const target = NotificationService.resolveNavigationTarget({
        type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
        expenseId: 'exp_abc_123',
        roomId: 'room_xyz_789',
      });

      expect(target).toEqual({
        route: '/rooms/expenses/exp_abc_123',
        params: { roomId: 'room_xyz_789' },
      });
    });

    it('should route to room detail screen when only roomId is present', () => {
      const target = NotificationService.resolveNavigationTarget({
        type: 'MEMBER_JOINED',
        roomId: 'room_xyz_789',
      });

      expect(target).toEqual({
        route: '/rooms/room_xyz_789',
      });
    });

    it('should route to room settlements tab when settlementId and roomId are present', () => {
      const target = NotificationService.resolveNavigationTarget({
        type: 'SETTLEMENT_REQUESTED',
        roomId: 'room_xyz_789',
        settlementId: 'settle_456',
      });

      expect(target).toEqual({
        route: '/rooms/room_xyz_789',
        params: { tab: 'settlements', settlementId: 'settle_456' },
      });
    });

    it('should route to home with showUpdate param when type is APP_UPDATE', () => {
      const target = NotificationService.resolveNavigationTarget({
        type: 'APP_UPDATE',
        updateId: 'update_ota_99',
      });

      expect(target).toEqual({
        route: '/(tabs)',
        params: { showUpdate: 'true' },
      });
    });

    it('should return null when notification data is empty or invalid', () => {
      expect(NotificationService.resolveNavigationTarget(null)).toBeNull();
      expect(NotificationService.resolveNavigationTarget({})).toBeNull();
    });
  });

  describe('Update Notification Delivery & Deduplication', () => {
    it('schedules notification for a new update with missing notes', async () => {
      const scheduled = await NotificationService.notifyUpdateAvailable('update_ota_1', [
        'Receipt verification push alerts',
        'Dark mode contrast fixes',
      ]);

      expect(scheduled).toBe(true);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            title: 'New Update Available',
            body: 'Receipt verification push alerts • Dark mode contrast fixes',
            data: { type: 'APP_UPDATE', updateId: 'update_ota_1' },
          }),
        })
      );
      expect(
        await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.LAST_NOTIFIED_UPDATE_ID)
      ).toBe('update_ota_1');
    });

    it('deduplicates and skips notifying repeatedly for the same updateId', async () => {
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.LAST_NOTIFIED_UPDATE_ID,
        'update_ota_1'
      );
      (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();

      const scheduled = await NotificationService.notifyUpdateAvailable('update_ota_1', [
        'Some notes',
      ]);

      expect(scheduled).toBe(false);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('falls back to default summary when notes are empty', async () => {
      const scheduled = await NotificationService.notifyUpdateAvailable('update_ota_2', []);

      expect(scheduled).toBe(true);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Bug fixes and performance improvements.',
          }),
        })
      );
    });
  });

  describe('Android Settings Linking', () => {
    it('should open system settings via Linking.openSettings', async () => {
      await NotificationService.openNotificationSettings();
      expect(Linking.openSettings).toHaveBeenCalled();
    });
  });
});
