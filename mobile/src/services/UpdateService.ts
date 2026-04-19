import DeviceInfo from 'react-native-device-info';
import { Alert, Linking, Platform } from 'react-native';
import { CONFIG } from '../config';
import { AzureLogger } from '../utils/AzureLogger';

export const UpdateService = {
    async checkVersion() {
        if (Platform.OS !== 'android') return;

        try {
            const currentVersion = DeviceInfo.getVersion();
            // Optional: check build number too
            // const currentBuild = DeviceInfo.getBuildNumber();

            const response = await fetch(`${CONFIG.SIGNALING_SERVER}/version/latest`);
            if (!response.ok) return;

            const data = await response.json();
            const { version: latestVersion, url, changelog } = data;

            if (this.isNewerVersion(currentVersion, latestVersion)) {
                Alert.alert(
                    "Actualización Disponible",
                    `Versión ${latestVersion} está lista.\n\n${changelog || ''}`,
                    [
                        { text: "Más tarde", style: "cancel" },
                        { text: "Actualizar", onPress: () => Linking.openURL(url) }
                    ]
                );
            }
        } catch (e) {
            AzureLogger.log('Update Check Failed', { error: String(e) }, 'WARN');
        }
    },

    isNewerVersion(current: string, latest: string) {
        const c = current.split('.').map(Number);
        const l = latest.split('.').map(Number);

        for (let i = 0; i < Math.max(c.length, l.length); i++) {
            const cNum = c[i] || 0;
            const lNum = l[i] || 0;
            if (lNum > cNum) return true;
            if (lNum < cNum) return false;
        }
        return false;
    }
};
