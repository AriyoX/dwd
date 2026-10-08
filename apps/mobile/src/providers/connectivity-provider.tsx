import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';

const Context = createContext<{ online: boolean | null }>({ online: null });

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const publish = (state: Network.NetworkState) => {
      if (active)
        setOnline(
          state.isConnected === false || state.isInternetReachable === false
            ? false
            : state.isInternetReachable === true
              ? true
              : null,
        );
    };
    const refresh = () => {
      const attempt = ++version;
      void Network.getNetworkStateAsync()
        .then((state) => {
          if (active && attempt === version) publish(state);
        })
        .catch(() => {
          /* Unknown connectivity still allows a request. */
        });
    };
    refresh();
    const network = Network.addNetworkStateListener((state) => {
      version++;
      publish(state);
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      network.remove();
      foreground.remove();
    };
  }, []);
  return <Context.Provider value={{ online }}>{children}</Context.Provider>;
}

export const useConnectivity = () => useContext(Context);
