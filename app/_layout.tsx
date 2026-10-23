import React from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { DB_NAME } from '../src/db/schema';
import { migrateDbIfNeeded } from '../src/db/client';
import { colors } from '../src/theme/colors';
import { AuthProvider } from '../src/context/AuthContext';
import { isFirebaseConfigured, firebaseConfigError } from '../src/services/firebase';
import { ConfigurationDiagnosticScreen } from '../src/components/ConfigurationDiagnosticScreen';
import { UpdateNotification } from '../src/components/UpdateNotification';
import { NotificationPermissionModal } from '../src/components/NotificationPermissionModal';
import { NotificationService } from '../src/services/notification-service';
import { ExpenseClientService } from '../src/services/expense-client';
import {
  isValidRejectionReason,
  parseExpenseNotificationActionResponse,
} from '../src/services/notification-actions';
import { ApiError } from '../src/services/api-client';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

function AppNavigation() {
  const { resolvedMode } = useTheme();

  return (
    <>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <UpdateNotification />
      <NotificationManager />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: 'About & Privacy',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="expense/create"
          options={{
            title: 'Add Expense',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="expense/[id]"
          options={{
            title: 'Expense Details',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="auth/login"
          options={{
            title: 'Sign In',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="auth/register"
          options={{
            title: 'Create Account',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="rooms/create"
          options={{
            title: 'Create Room',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="rooms/join"
          options={{
            title: 'Join Room',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="rooms/[id]"
          options={{
            title: 'Room Details',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="rooms/expenses/create"
          options={{
            title: 'Add Room Expense',
            presentation: 'modal',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="rooms/expenses/[expenseId]"
          options={{
            title: 'Expense Details',
            headerShown: true,
          }}
        />
      </Stack>
    </>
  );
}

function NotificationManager() {
  const { user } = useAuth();
  const router = useRouter();
  const [showPermissionModal, setShowPermissionModal] = React.useState(false);
  const [requestingPermission, setRequestingPermission] = React.useState(false);
  const userIdRef = React.useRef<string | undefined>(user?.uid);
  const handledActionKeysRef = React.useRef(new Set<string>());
  const pendingActionResponseRef = React.useRef<Notifications.NotificationResponse | null>(null);

  React.useEffect(() => {
    userIdRef.current = user?.uid;
  }, [user?.uid]);

  const handleNotificationResponse = React.useCallback(async (response: Notifications.NotificationResponse) => {
    const action = parseExpenseNotificationActionResponse(response);
    if (!action) {
      const target = NotificationService.resolveNavigationTarget(
        response.notification.request.content.data
      );
      if (target) {
        if (target.params) {
          router.push({ pathname: target.route as any, params: target.params });
        } else {
          router.push(target.route as any);
        }
      }
      return;
    }

    if (handledActionKeysRef.current.has(action.responseKey)) return;
    if (!userIdRef.current) {
      pendingActionResponseRef.current = response;
      return;
    }
    handledActionKeysRef.current.add(action.responseKey);

    if (action.action === 'reject' && !isValidRejectionReason(action.reason)) {
      Alert.alert(
        'Reason required',
        'Enter at least 3 characters to reject this expense.',
        [{ text: 'Open expense', onPress: () => router.push(`/rooms/expenses/${action.expenseId}` as any) }]
      );
      return;
    }

    try {
      if (action.action === 'acknowledge') {
        await ExpenseClientService.acknowledgeExpense(action.expenseId, action.expectedRevision);
        Alert.alert('Expense acknowledged', 'Your acknowledgement was saved on the server.');
      } else {
        await ExpenseClientService.rejectExpense(
          action.expenseId,
          action.expectedRevision,
          action.reason!
        );
        Alert.alert('Rejection submitted', 'Your reason was saved on the server.');
      }
      router.push(`/rooms/expenses/${action.expenseId}` as any);
    } catch (error: any) {
      const message =
        error instanceof ApiError && error.statusCode === 409
          ? 'This expense changed before your response was submitted. Its current state will be refreshed.'
          : error instanceof ApiError && error.statusCode === 403
            ? 'You are no longer eligible to respond to this expense.'
            : error?.message || 'The response could not be submitted. Please try again.';
      Alert.alert('Response not submitted', message, [
        { text: 'Open expense', onPress: () => router.push(`/rooms/expenses/${action.expenseId}` as any) },
        { text: 'OK' },
      ]);
      // Fetching is deliberately best-effort and never treated as a successful mutation.
      try {
        await ExpenseClientService.getExpenseById(action.expenseId);
      } catch {
        // The detail screen will show the same server error if it cannot refresh.
      }
    }
  }, [router]);

  React.useEffect(() => {
    // 1. Configure Android Notification Channel
    NotificationService.configureChannel();
    NotificationService.configureExpenseActions();

    // 2. Check if we should prompt user for permission
    NotificationService.shouldPromptUser().then((shouldPrompt) => {
      if (shouldPrompt) {
        setShowPermissionModal(true);
      }
    });

    // 3. Handle cold start notification tap (when app was closed)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        void handleNotificationResponse(response);
      }
    });

    // 4. Handle foreground/background notification tap
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handleNotificationResponse(response);
      }
    );

    // 5. Handle token refresh
    const tokenListener = Notifications.addPushTokenListener(async (tokenData) => {
      if (user?.uid && tokenData.data) {
        await NotificationService.registerTokenWithBackend(tokenData.data);
      }
    });

    return () => {
      responseListener.remove();
      tokenListener.remove();
    };
  }, [handleNotificationResponse, router]);

  React.useEffect(() => {
    if (!user?.uid || !pendingActionResponseRef.current) return;
    const response = pendingActionResponseRef.current;
    pendingActionResponseRef.current = null;
    void handleNotificationResponse(response);
  }, [user?.uid, handleNotificationResponse]);

  // Sync token whenever auth state changes (login, logout, switch user)
  React.useEffect(() => {
    NotificationService.syncAuthUserState(user?.uid || null);
  }, [user?.uid]);

  const handleEnablePermission = async () => {
    setRequestingPermission(true);
    try {
      await NotificationService.requestPermissionAndRegister(user?.uid);
    } finally {
      setRequestingPermission(false);
      setShowPermissionModal(false);
    }
  };

  const handleDismissPermission = async () => {
    await NotificationService.markPromptCompleted();
    setShowPermissionModal(false);
  };

  return (
    <NotificationPermissionModal
      visible={showPermissionModal}
      onEnable={handleEnablePermission}
      onDismiss={handleDismissPermission}
      loading={requestingPermission}
    />
  );
}

export default function RootLayout() {
  if (!isFirebaseConfigured) {
    return <ConfigurationDiagnosticScreen message={firebaseConfigError} />;
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
          <AppNavigation />
        </SQLiteProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
