import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import MonitorScreen from '../screens/MonitorScreen';
import ViewerScreen from '../screens/ViewerScreen';
import LoginScreen from '../screens/LoginScreen';
import { authService } from '../utils/AuthService';
import { navigationRef } from './navigationRef';
import { isAdbRecordDeepLink } from '../utils/adbDeepLink';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    useEffect(() => {
        const sub = Linking.addEventListener('url', async ({ url }) => {
            if (!isAdbRecordDeepLink(url)) return;
            const user = await authService.getCurrentUser();
            if (!user || !navigationRef.isReady()) return;
            navigationRef.navigate('Monitor', { adbAutoRecord: true });
        });
        return () => sub.remove();
    }, []);

    return (
        <NavigationContainer ref={navigationRef}>
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
