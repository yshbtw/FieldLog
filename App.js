import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { WorkSessionProvider } from './src/context/WorkSessionContext';
import TabNavigator from './src/navigation/TabNavigator';

export default function App() {
  return (
    <WorkSessionProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <TabNavigator />
      </NavigationContainer>
    </WorkSessionProvider>
  );
}
