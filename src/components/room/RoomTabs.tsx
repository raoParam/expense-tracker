import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export type RoomTab = 'expenses' | 'balances' | 'settlements' | 'members';

export interface RoomTabPage {
  id: RoomTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
  content: React.ReactNode;
}

interface Props {
  header: React.ReactNode;
  pages: RoomTabPage[];
  /** Tab requested by a deep link or notification. */
  requestedTab?: string;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Pinned header, scrollable tab bar and a swipeable pager with one page per tab. */
export function RoomTabs({ header, pages, requestedTab, refreshing, onRefresh }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<RoomTab>(
    pages.find((p) => p.id === requestedTab)?.id ?? 'expenses'
  );
  const [containerWidth, setContainerWidth] = useState(windowWidth || 360);
  const pagerRef = useRef<ScrollView>(null);
  const tabBarRef = useRef<ScrollView>(null);

  const activeIndex = Math.max(0, pages.findIndex((p) => p.id === activeTab));

  const scrollTabIntoView = (index: number) => {
    tabBarRef.current?.scrollTo({ x: Math.max(0, index * 125 - 40), animated: true });
  };

  const selectTab = (tab: RoomTab, index: number) => {
    setActiveTab(tab);
    if (containerWidth > 0) pagerRef.current?.scrollTo({ x: index * containerWidth, animated: true });
    scrollTabIntoView(index);
  };

  useEffect(() => {
    const index = pages.findIndex((p) => p.id === requestedTab);
    if (index >= 0) selectTab(pages[index].id, index);
  }, [requestedTab, containerWidth]);

  const handlePagerEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth <= 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    const page = pages[index];
    if (page && page.id !== activeTab) {
      setActiveTab(page.id);
      scrollTabIntoView(index);
    }
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - containerWidth) > 1) {
      setContainerWidth(width);
      pagerRef.current?.scrollTo({ x: activeIndex * width, animated: false });
    }
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.headerSection}>
        {header}

        <View style={styles.tabsWrapper}>
          <ScrollView ref={tabBarRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
            {pages.map((page, index) => {
              const isActive = activeTab === page.id;
              return (
                <TouchableOpacity
                  key={page.id}
                  activeOpacity={0.7}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => selectTab(page.id, index)}
                >
                  <Ionicons name={page.icon} size={16} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{page.label}</Text>
                  {page.badge ? (
                    <View style={[styles.badge, isActive && styles.badgeActive]}>
                      <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{page.badge}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerEnd}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {pages.map((page) => (
          <ScrollView
            key={page.id}
            style={{ width: containerWidth }}
            contentContainerStyle={styles.pageContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            {page.content}
          </ScrollView>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  tabsWrapper: {
    marginVertical: spacing.xs,
  },
  tabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  tabText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: colors.surface,
  },
  pager: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
  },
}));
