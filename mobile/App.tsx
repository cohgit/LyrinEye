import 'react-native-gesture-handler';
import React from 'react';
import AppNavigator from './src/navigation';

import { RemoteLogger } from './src/utils/RemoteLogger';
import { AzureLogger } from './src/utils/AzureLogger';

RemoteLogger.init();
AzureLogger.log('App Started', { mode: 'system' });

const App = () => {
  return <AppNavigator />;
};

export default App;
