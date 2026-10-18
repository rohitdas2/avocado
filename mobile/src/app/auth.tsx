import { Redirect, router, useLocalSearchParams } from 'expo-router';
import SignIn from '../../SignIn';
import { useSession } from '../../session';

export default function Authentication() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { guest } = useSession();
  if (!guest) return <Redirect href="/" />;
  return <SignIn initialMode={mode === 'register' ? 'register' : 'login'} onCancel={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />;
}
