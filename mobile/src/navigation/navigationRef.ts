import { createNavigationContainerRef } from '@react-navigation/native';

export type RootStackParamList = {
    Login: undefined;
    Home: undefined;
    Monitor: { adbAutoRecord?: boolean } | undefined;
    Viewer: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
