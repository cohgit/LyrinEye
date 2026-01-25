import 'react-native-gesture-handler';
import React from 'react';
import AppNavigator from './src/navigation';

import { RemoteLogger } from './src/utils/RemoteLogger';

RemoteLogger.init();

const App = () => {
  return <AppNavigator />;
};

export default App;
