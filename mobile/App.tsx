import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import AppNavigator from './src/navigation';
import { RemoteLogger } from './src/utils/RemoteLogger';
import { AzureLogger } from './src/utils/AzureLogger';

RemoteLogger.init();

const App = () => {
  useEffect(() => {
    AzureLogger.log('App Started', { mode: 'system' });

    const intervalId = setInterval(async () => {
      const metrics = await AzureLogger.getSystemMetrics();
      AzureLogger.log('System Status', { mode: 'system', ...metrics });
    }, 60000); // 1 minute

    return () => clearInterval(intervalId);
  }, []);

  return <AppNavigator />;
};

export default App;
