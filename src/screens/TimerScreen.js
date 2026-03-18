import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import SettingsModal from '../components/SettingsModal';

export default function TimerScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const query = search.toLowerCase();
    return contacts.filter((c) => c.name?.toLowerCase().includes(query));
  }, [contacts, search]);

  function handleSelectContact(contact) {
    navigation.navigate('TimerSession', {
      contactName: contact.name || 'Unknown',
      contactId: contact.id,
    });
  }

  function getInitials(name) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  // Deterministic color from name
  function getAvatarColor(name) {
    const colors = ['#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#10B981'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Loading contacts...</Text>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.errorTitle}>Permission Required</Text>
        <Text style={styles.errorText}>
          Please grant contacts permission in your device settings to use this feature.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadContacts}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Contacts</Text>
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Ionicons name="settings-outline" size={24} color="#111827" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>Select a contact to start tracking</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Results Count */}
      <Text style={styles.resultCount}>
        {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
      </Text>

      {/* Contact List */}
      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emoji}>📭</Text>
            <Text style={styles.emptyText}>
              {search ? 'No contacts match your search' : 'No contacts found'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.contactItem}
            activeOpacity={0.7}
            onPress={() => handleSelectContact(item)}
          >
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{item.name || 'Unknown'}</Text>
              {item.phoneNumbers?.[0] && (
                <Text style={styles.contactPhone}>{item.phoneNumbers[0].number}</Text>
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
      <SettingsModal 
        visible={settingsVisible} 
        onClose={() => setSettingsVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '500',
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  clearIcon: {
    color: '#9CA3AF',
    fontSize: 18,
    paddingLeft: 8,
  },
  resultCount: {
    color: '#6B7280',
    fontSize: 14,
    marginHorizontal: 28,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '500',
  },
  listContent: {
    padding: 24,
    paddingTop: 8,
    paddingBottom: 110, // Important: Space for the new 70px tall floating tab bar
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 16,
  },
  contactName: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  contactPhone: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  chevron: {
    color: '#D1D5DB',
    fontSize: 28,
    fontWeight: '300',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});
