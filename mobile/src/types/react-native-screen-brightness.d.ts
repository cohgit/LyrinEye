declare module 'react-native-screen-brightness' {
    export default class ScreenBrightness {
        static getBrightness(): Promise<number>;
        static setBrightness(value: number): void;
        static hasPermission(): Promise<boolean>;
        static requestPermission(): Promise<boolean>;
    }
}
