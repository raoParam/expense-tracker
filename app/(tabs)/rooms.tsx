import { createThemedStyles } from '../../src/theme/themed-styles';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Room, RoomClientService } from '../../src/services/room-service';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function RoomsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await RoomClientService.listRooms();
      setRooms(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch rooms.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchRooms();
      }
    }, [user, fetchRooms])
  );

  // If user is NOT logged in: Show Unauthenticated Hero & Auth Options
  if (!authLoading && !user) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerBox}>
          <View style={styles.iconCircle}>
            <Ionicons name="people" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Shared Rooms</Text>
          <Text style={styles.subtitle}>
            Collaborate with roommates, split living expenses, and track shared balances.
          </Text>
        </View>

        <Card style={styles.authCard}>
          <Text style={styles.authCardTitle}>Sign In to Access Shared Rooms</Text>
          <Text style={styles.authCardDesc}>
            Join or create shared rooms with your roommates. Personal expenses remain private on your device.
          </Text>

          <View style={styles.authActions}>
            <Button
              title="Sign In"
              onPress={() => router.push('/auth/login')}
              style={styles.authBtn}
            />
            <Button
              title="Create Account"
              onPress={() => router.push('/auth/register')}
              variant="outline"
              style={styles.authBtn}
            />
          </View>
        </Card>

        <Card style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Shared Room Features</Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} style={styles.featureIcon} />
              <Text style={styles.featureText}>
                <Text style={styles.featureBold}>Invite-Only:</Text> Join rooms securely via 6-character invitation codes.
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="people-outline" size={18} color={colors.primary} style={styles.featureIcon} />
              <Text style={styles.featureText}>
                <Text style={styles.featureBold}>Member Management:</Text> Room admins can invite or remove members transparently.
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="calculator-outline" size={18} color={colors.primary} style={styles.featureIcon} />
              <Text style={styles.featureText}>
                <Text style={styles.featureBold}>Exact Splits (M4):</Text> Equal, itemized, and percentage splits with 0 rounding errors.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => fetchRooms(true)} />
      }
    >
      {/* Action Header */}
      <View style={styles.topActionRow}>
        <Button
          title="+ Create Room"
          onPress={() => router.push('/rooms/create')}
          style={styles.topBtn}
        />
        <Button
          title="Join with Code"
          onPress={() => router.push('/rooms/join')}
          variant="outline"
          style={styles.topBtn}
        />
      </View>

      {/* Loading state */}
      {loading && !refreshing && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your rooms...</Text>
        </View>
      )}

      {/* Error state */}
      {error && (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={() => fetchRooms()} variant="outline" />
        </Card>
      )}

      {/* Rooms List */}
      {!loading && rooms.length === 0 && !error && (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="home-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Shared Rooms Yet</Text>
          <Text style={styles.emptyDesc}>
            Create a room for your hostel or flatmates, or ask your roommate for an invite code.
          </Text>
        </Card>
      )}

      {!loading && rooms.length > 0 && (
        <View style={styles.roomListSection}>
          <Text style={styles.sectionTitle}>Your Rooms ({rooms.length})</Text>

          {rooms.map((room) => {
            const activeMemberCount = room.members.filter((m) => m.status === 'active').length;
            const isAdmin = room.adminId === user?.uid;

            return (
              <TouchableOpacity
                key={room._id}
                activeOpacity={0.7}
                onPress={() => router.push(`/rooms/${room._id}`)}
              >
                <Card style={styles.roomCard}>
                  <View style={styles.roomCardHeader}>
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomName}>{room.name}</Text>
                      {room.description ? (
                        <Text style={styles.roomDesc} numberOfLines={1}>
                          {room.description}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.badge,
                        room.status === 'active' ? styles.activeBadge : styles.archivedBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          room.status === 'active'
                            ? styles.activeBadgeText
                            : styles.archivedBadgeText,
                        ]}
                      >
                        {room.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.roomCardFooter}>
                    <View style={styles.footerItem}>
                      <Ionicons name="people-outline" size={15} color={colors.textSecondary} />
                      <Text style={styles.footerText}>
                        {activeMemberCount} {activeMemberCount === 1 ? 'member' : 'members'}
                      </Text>
                    </View>

                    {isAdmin && (
                      <View style={styles.adminTag}>
                        <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
                        <Text style={styles.adminTagText}>Admin</Text>
                      </View>
                    )}

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textMuted}
                      style={styles.arrowIcon}
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerBox: {
    alignItems: 'center',
    marginVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 18,
  },
  authCard: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    padding: spacing.xl,
  },
  authCardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  authCardDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  authActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  authBtn: {
    flex: 1,
  },
  featuresCard: {
    marginTop: spacing.xs,
  },
  featuresTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  featureList: {
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  featureIcon: {
    marginTop: 2,
    marginRight: 4,
  },
  featureBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  featureText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  topActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  topBtn: {
    flex: 1,
  },
  loadingBox: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  roomListSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
  },
  roomCard: {
    gap: spacing.md,
  },
  roomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  roomInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  roomName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  roomDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  activeBadge: {
    backgroundColor: colors.successLight,
  },
  archivedBadge: {
    backgroundColor: colors.borderSubtle,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  activeBadgeText: {
    color: colors.success,
  },
  archivedBadgeText: {
    color: colors.textMuted,
  },
  roomCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  adminTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginLeft: spacing.md,
  },
  adminTagText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  arrowIcon: {
    marginLeft: 'auto',
  },
}));
