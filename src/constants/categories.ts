export interface CategoryDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: 'food',
    name: 'Food & Mess',
    icon: 'restaurant-outline',
    color: '#F59E0B',
    description: 'Mess bills, dining out, snacks, beverages',
  },
  {
    id: 'groceries',
    name: 'Groceries & Supplies',
    icon: 'cart-outline',
    color: '#10B981',
    description: 'Room essentials, toiletries, daily supplies',
  },
  {
    id: 'rent',
    name: 'Rent & Accommodation',
    icon: 'home-outline',
    color: '#6366F1',
    description: 'Monthly PG/hostel rent and maintenance',
  },
  {
    id: 'utilities',
    name: 'Utilities & Wi-Fi',
    icon: 'flash-outline',
    color: '#3B82F6',
    description: 'Electricity, internet, water, laundry',
  },
  {
    id: 'travel',
    name: 'Travel & Transport',
    icon: 'bus-outline',
    color: '#EC4899',
    description: 'Bus, train, cab, fuel, metro passes',
  },
  {
    id: 'academic',
    name: 'Academic & Stationery',
    icon: 'book-outline',
    color: '#8B5CF6',
    description: 'Books, notebooks, prints, exam fees',
  },
  {
    id: 'health',
    name: 'Medical & Health',
    icon: 'medkit-outline',
    color: '#EF4444',
    description: 'Medicines, clinic visits, hygiene',
  },
  {
    id: 'entertainment',
    name: 'Outings & Leisure',
    icon: 'film-outline',
    color: '#14B8A6',
    description: 'Movies, gaming, subscriptions, trips',
  },
  {
    id: 'other',
    name: 'Miscellaneous',
    icon: 'ellipsis-horizontal-outline',
    color: '#64748B',
    description: 'Other personal expenses',
  },
] as const;

export const DEFAULT_CATEGORY_ID = 'food';

export function getCategoryById(id: string): CategoryDefinition {
  const found = CATEGORIES.find((c) => c.id === id);
  return (
    found || {
      id: 'other',
      name: 'Miscellaneous',
      icon: 'ellipsis-horizontal-outline',
      color: '#64748B',
      description: 'Other personal expenses',
    }
  );
}
