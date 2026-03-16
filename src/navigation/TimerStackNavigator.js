import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TimerScreen from '../screens/TimerScreen';
import TimerSessionScreen from '../screens/TimerSessionScreen';

const Stack = createNativeStackNavigator();

export default function TimerStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#F2F2F7',
        },
        headerTintColor: '#111827',
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: '#F2F2F7',
        },
      }}
    >
      <Stack.Screen
        name="ContactList"
        component={TimerScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TimerSession"
        component={TimerSessionScreen}
        options={({ route }) => ({
          title: route.params?.contactName || 'Timer Session',
        })}
      />
    </Stack.Navigator>
  );
}
