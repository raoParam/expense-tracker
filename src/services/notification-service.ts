import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api-client';
import { EXPENSE_ACKNOWLEDGEMENT_CATEGORY_ID } from './notification-actions';

export const NOTIFICATION_STORAGE_KEYS = {
  PROMPT_COMPLETED: '@spendly/notification_prompt_completed',
  DEVICE_TOKEN: '@spendly/device_push_token',
  REGISTERED_USER_ID: '@spendly/registered_user_id',
  LAST_NOTIFIED_UPDATE_ID: '@spendly/last_notified_update_id',
};

export const NOTIFICATION_CHANNEL_ID = 'spendly-default';

// Configure notification presentation when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface NotificationNavigationTarget {
  route: string;
  params?: Record<string, any>;
}

export const NotificationService = {
  /**
   * Configure Android notification channel with high importance
   */
  async configureChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Spendly Alerts',
        description: 'Notifications for shared expenses, acknowledgements, and settlements',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
  },

  /** Register response actions in JS so already-installed builds can receive
   * acknowledgement controls without changing the Android application ID. */
  async configureExpenseActions(): Promise<void> {
    try {
      await Notifications.setNotificationCategoryAsync(EXPENSE_ACKNOWLEDGEMENT_CATEGORY_ID, [
        {
          identifier: 'expense_acknowledge',
          buttonTitle: 'Acknowledge',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'expense_reject',
          buttonTitle: 'Reject',
          textInput: {
            submitButtonTitle: 'Reject',
            placeholder: 'Reason (required)',
          },
          options: { opensAppToForeground: true, isDestructive: true },
        },
      ]);
    } catch (err: any) {
      console.warn('[NotificationService] Expense notification actions unavailable:', err?.message);
    }
  },

  /**
   * Get current permission status
   */
  async getPermissionStatus(): Promise<Notifications.NotificationPermissionsStatus> {
    return Notifications.getPermissionsAsync();
  },

  /**
   * Determine whether to explain and ask for notification permission
   * Returns false if user already granted or if user already responded and denied (do not repeatedly nag)
   */
  async shouldPromptUser(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    // Check if permission is already granted
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') {
      return false;
    }

    // Check if user already dismissed/responded previously
    const prompted = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.PROMPT_COMPLETED);
    if (prompted === 'true') {
      return false;
    }

    // If canAskAgain is false, Android won't show system prompt anyway
    if (current.canAskAgain === false) {
      return false;
    }

    return true;
  },

  /**
   * Record that the user was prompted (even if they dismissed)
   */
  async markPromptCompleted(): Promise<void> {
    await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.PROMPT_COMPLETED, 'true');
  },

  /**
   * Get Expo Push Token safely
   */
  async getExpoPushToken(): Promise<string | null> {
    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        (Constants as any).easConfig?.projectId ||
        'db8a6444-9fc6-4cf4-9e62-73b8d4493c75';

      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      return tokenResponse.data;
    } catch (err: any) {
      console.warn('[NotificationService] Failed to get Expo push token:', err?.message);
      return null;
    }
  },

  /**
   * Register push token with backend API for authenticated user
   */
  async registerTokenWithBackend(token: string): Promise<boolean> {
    try {
      await apiRequest('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({
          token,
          platform: Platform.OS,
        }),
      });
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN, token);
      return true;
    } catch (err: any) {
      console.warn('[NotificationService] Failed to register device token with backend:', err?.message);
      return false;
    }
  },

  /**
   * Unregister token from backend upon logout
   */
  async unregisterTokenFromBackend(timeoutMs = 4000): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN);
      if (token) {
        await apiRequest('/notifications/device-token', {
          method: 'DELETE',
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
      }
    } catch (err: any) {
      console.warn('[NotificationService] Failed to unregister device token from backend:', err?.message);
    } finally {
      clearTimeout(timeoutId);
      try {
        await AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID);
      } catch (storageErr: any) {
        console.warn('[NotificationService] Failed to clear registered user key:', storageErr?.message);
      }
    }
  },

  /**
   * Request system permission and register device token if granted
   */
  async requestPermissionAndRegister(userId?: string): Promise<{
    granted: boolean;
    token: string | null;
  }> {
    await this.markPromptCompleted();

    const response = await Notifications.requestPermissionsAsync();
    const granted = response.granted || response.status === 'granted';

    if (!granted) {
      return { granted: false, token: null };
    }

    await this.configureChannel();
    const token = await this.getExpoPushToken();

    if (token && userId) {
      await this.registerTokenWithBackend(token);
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, userId);
    }

    return { granted: true, token };
  },

  /**
   * Handle user login/logout/token refresh synchronization
   */
  async syncAuthUserState(currentUserId: string | null): Promise<void> {
    if (!currentUserId) {
      // User logged out. If registered user is still set, attempt unregister; otherwise cleanup local state
      const lastRegisteredUser = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID
      );
      if (lastRegisteredUser) {
        await this.unregisterTokenFromBackend();
      } else {
        await AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID);
      }
      return;
    }

    // Check permission
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && permissions.status !== 'granted') {
      return;
    }

    // Ensure channel is configured
    await this.configureChannel();

    // Check if token already registered for this user
    const lastRegisteredUser = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID);
    let token = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.DEVICE_TOKEN);

    if (!token) {
      token = await this.getExpoPushToken();
    }

    if (token && (lastRegisteredUser !== currentUserId || !lastRegisteredUser)) {
      const success = await this.registerTokenWithBackend(token);
      if (success) {
        await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEYS.REGISTERED_USER_ID, currentUserId);
      }
    }
  },

  /**
   * Schedule a local notification when an applicable OTA update is ready,
   * describing only the missing features/fixes and deduplicating by updateId.
   */
  async notifyUpdateAvailable(
    updateId: string,
    notes: string[] = [],
    releaseTitle?: string
  ): Promise<boolean> {
    if (!updateId) return false;

    try {
      const lastNotified = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.LAST_NOTIFIED_UPDATE_ID
      );
      if (lastNotified === updateId) {
        return false;
      }

      await this.configureChannel();

      const summary =
        notes.length > 0
          ? notes.slice(0, 2).join(' • ')
          : 'Bug fixes and performance improvements.';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: releaseTitle || 'New Update Available',
          body: summary,
          data: {
            type: 'APP_UPDATE',
            updateId,
          },
        },
        trigger: null,
      });

      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.LAST_NOTIFIED_UPDATE_ID,
        updateId
      );
      return true;
    } catch (err: any) {
      console.warn('[NotificationService] Failed to notify update available:', err?.message);
      return false;
    }
  },

  /**
   * Parse notification payload into app navigation target
   */
  resolveNavigationTarget(notificationData: any): NotificationNavigationTarget | null {
    if (!notificationData) return null;

    const { expenseId, roomId, settlementId, type } = notificationData;

    if (type === 'APP_UPDATE') {
      return {
        route: '/(tabs)',
        params: { showUpdate: 'true' },
      };
    }

    // Route directly to expense detail / acknowledgement screen if expenseId is present
    if (expenseId) {
      return {
        route: `/rooms/expenses/${expenseId}`,
        params: roomId ? { roomId } : undefined,
      };
    }

    // Route directly to room settlement tab if settlementId is present
    if (settlementId && roomId) {
      return {
        route: `/rooms/${roomId}`,
        params: { tab: 'settlements', settlementId },
      };
    }

    // Route to room screen if roomId is present
    if (roomId) {
      return {
        route: `/rooms/${roomId}`,
      };
    }

    return null;
  },

  /**
   * Open Android app notification settings when permission was denied
   */
  async openNotificationSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (err: any) {
      console.warn('[NotificationService] Unable to open system settings:', err?.message);
    }
  },
};
