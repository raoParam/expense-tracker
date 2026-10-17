import React from 'react';
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
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

function NotificationManager() {
  const { user } = useAuth();
  const router = useRouter();
  const [showPermissionModal, setShowPermissionModal] = React.useState(false);
  const [requestingPermission, setRequestingPermission] = React.useState(false);

  React.useEffect(() => {
    // 1. Configure Android Notification Channel
    NotificationService.configureChannel();

    // 2. Check if we should prompt user for permission
    NotificationService.shouldPromptUser().then((shouldPrompt) => {
      if (shouldPrompt) {
        setShowPermissionModal(true);
      }
    });

    // 3. Handle cold start notification tap (when app was closed)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const target = NotificationService.resolveNavigationTarget(
          response.notification.request.content.data
        );
        if (target) {
          router.push(target.route as any);
        }
      }
    });

    // 4. Handle foreground/background notification tap
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const target = NotificationService.resolveNavigationTarget(
          response.notification.request.content.data
        );
        if (target) {
          router.push(target.route as any);
        }
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
  }, []);

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
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
        <StatusBar style="dark" />
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
      </SQLiteProvider>
    </AuthProvider>
  );
}
