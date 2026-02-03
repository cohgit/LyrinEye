import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import AppNavigator from './src/navigation';
import { Telemetry } from './src/utils/TelemetryService';
import { FCM } from './src/services/FirebaseMessagingService';
import { AzureLogger } from './src/utils/AzureLogger';

const App = () => {
  useEffect(() => {
    AzureLogger.checkInstallation();
    Telemetry.start();
    FCM.init(); // Initialize Firebase Cloud Messaging

    return () => {
      Telemetry.stop();
    };
  }, []);

  return <AppNavigator />;
};

export default App;
