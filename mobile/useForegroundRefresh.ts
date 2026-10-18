import { useEffect } from 'react';
import { AppState } from 'react-native';

export default function useForegroundRefresh(refresh: () => void) {
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000);
    return () => { listener.remove(); clearInterval(interval); };
  }, [refresh]);
}
