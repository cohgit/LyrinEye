import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import MonitorScreen from '../screens/MonitorScreen';
import ViewerScreen from '../screens/ViewerScreen';
import LoginScreen from '../screens/LoginScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Login"
                screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right'
                }}
            >
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Monitor" component={MonitorScreen} />
                <Stack.Screen name="Viewer" component={ViewerScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
