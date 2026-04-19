import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import AppNavigator from './src/navigation';
import { Telemetry } from './src/utils/TelemetryService';
import { FCM } from './src/services/FirebaseMessagingService';
import { UpdateService } from './src/services/UpdateService';
import { AzureLogger } from './src/utils/AzureLogger';

const App = () => {
  useEffect(() => {
    AzureLogger.checkInstallation();
    Telemetry.start();
    FCM.init(); // Initialize Firebase Cloud Messaging
    UpdateService.checkVersion(); // Check for remote updates

    return () => {
      Telemetry.stop();
    };
  }, []);

  return <AppNavigator />;
};

export default App;
