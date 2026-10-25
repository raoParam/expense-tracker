import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Room, RoomMember } from '../../services/room-service';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Button } from '../Button';
import { Card } from '../Card';
import { SectionTitle, ui } from './RoomUi';

interface Props {
  room: Room;
  userId?: string;
  isAdmin: boolean;
  activeMembers: RoomMember[];
  removedMembers: RoomMember[];
  onRemove: (member: RoomMember) => void;
  onArchive: () => void;
}

const initialOf = (m: RoomMember) => (m.displayName || m.email || 'M').charAt(0).toUpperCase();

export function RoomMembersTab({ room, userId, isAdmin, activeMembers, removedMembers, onRemove, onArchive }: Props) {
  const isActiveRoom = room.status === 'active';

  return (
    <View style={ui.tabSection}>
      <SectionTitle>Active Members ({activeMembers.length})</SectionTitle>
      <Card style={styles.card}>
        {activeMembers.map((member, index) => {
          const isSelf = member.userId === userId;
          const isMemberAdmin = member.role === 'admin';

          return (
            <View
              key={member.userId}
              style={[styles.row, index === activeMembers.length - 1 && removedMembers.length === 0 && ui.lastRow]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialOf(member)}</Text>
              </View>

              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>
                    {member.displayName || 'Roommate'}
                    {isSelf ? ' (You)' : ''}
                  </Text>
                  {isMemberAdmin && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                {member.email ? <Text style={styles.email}>{member.email}</Text> : null}
                <Text style={styles.joined}>Joined {new Date(member.joinedAt).toLocaleDateString()}</Text>
              </View>

              {isAdmin && !isSelf && !isMemberAdmin && isActiveRoom && (
                <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(member)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {removedMembers.length > 0 && (
          <View style={styles.removedSection}>
            <Text style={styles.removedHeader}>Former Members</Text>
            {removedMembers.map((member, index) => (
              <View
                key={member.userId}
                style={[styles.row, styles.removedRow, index === removedMembers.length - 1 && ui.lastRow]}
              >
                <View style={[styles.avatar, styles.removedAvatar]}>
                  <Text style={styles.removedAvatarText}>{initialOf(member)}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, styles.removedText]}>{member.displayName || 'Roommate'} (Removed)</Text>
                  {member.email ? <Text style={[styles.email, styles.removedText]}>{member.email}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {isAdmin && isActiveRoom && (
        <View style={styles.adminControls}>
          <Button title="Archive Room" onPress={onArchive} variant="outline" style={styles.archiveBtn} />
        </View>
      )}
    </View>
  );
}

const styles = createThemedStyles(() => ({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.primary,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  email: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  joined: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  removedSection: {
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  removedHeader: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  removedRow: {
    opacity: 0.6,
  },
  removedAvatar: {
    backgroundColor: colors.borderSubtle,
  },
  removedAvatarText: {
    color: colors.textMuted,
  },
  removedText: {
    color: colors.textMuted,
  },
  adminControls: {
    marginTop: spacing.md,
  },
  archiveBtn: {
    borderColor: colors.danger,
  },
}));
