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

export default function RootLayout() {
  if (!isFirebaseConfigured) {
    return <ConfigurationDiagnosticScreen message={firebaseConfigError} />;
  }

  return (
    <AuthProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
        <StatusBar style="dark" />
        <UpdateNotification />
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
