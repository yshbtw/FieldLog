import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';

import { DashboardScreen } from '../screens';
import TimerStackNavigator from './TimerStackNavigator';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  const icons = {
    Dashboard: '📊',
    Timer: '⏱️',
  };

  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[label] || '📱'}
    </Text>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: '#F2F2F7',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          color: '#111827',
          fontWeight: '800',
          fontSize: 24,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 24,
          left: 24,
          right: 24,
          backgroundColor: '#1C1C1E',
          borderRadius: 40,
          borderTopWidth: 0,
          paddingBottom: 0,
          height: 64,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
          elevation: 10,
        },
        tabBarItemStyle: {
          paddingVertical: 10,
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Timer"
        component={TimerStackNavigator}
        options={{ title: 'Timer', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 22,
    opacity: 0.6,
  },
  iconFocused: {
    opacity: 1,
  },
});
