import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './HomeScreen';
import MapScreen from './MapScreen';

export type RootTabParamList = {
  Home: undefined;
  Map: { startCoord?: {latitude: number, longitude: number}, endCoord?: {latitude: number, longitude: number} } | undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor: '#1a73e8',
              tabBarInactiveTintColor: '#5f6368',
              tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: 60 },
              headerShown: false,
            }}
          >
            <Tab.Screen 
              name="Home" 
              component={HomeScreen} 
              options={{ tabBarLabel: 'Search', tabBarIcon: () => <></> }} 
            />
            <Tab.Screen 
              name="Map" 
              component={MapScreen} 
              options={{ tabBarLabel: 'Route', tabBarIcon: () => <></> }} 
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
