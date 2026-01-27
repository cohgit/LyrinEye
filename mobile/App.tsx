import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import AppNavigator from './src/navigation';
import { RemoteLogger } from './src/utils/RemoteLogger';
import { AzureLogger } from './src/utils/AzureLogger';

RemoteLogger.init();

const App = () => {
  useEffect(() => {
    AzureLogger.checkInstallation();
    AzureLogger.log('App Started', { mode: 'system' });

    // We can't use navigation here easily without a ref, 
    // but the AppNavigator initialRouteName logic or a simple Splash check is better.
    // For now, let's just keep the metrics interval.

    const intervalId = setInterval(async () => {
      const metrics = await AzureLogger.getSystemMetrics();
      AzureLogger.log('System Status', { mode: 'system', ...metrics });
    }, 60000); // 1 minute

    return () => clearInterval(intervalId);
  }, []);

  return <AppNavigator />;
};

export default App;
