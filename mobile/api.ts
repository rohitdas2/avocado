import { Platform } from 'react-native';
import { createClient } from './apiClient';
export { ApiError, RequestCancelledError } from './apiClient';
export { dateKey } from './workoutLogic';

// One client for the whole app. iOS Simulator reaches the Mac at 127.0.0.1, the Android emulator
// at 10.0.2.2; a phone needs EXPO_PUBLIC_API_URL set to the computer's LAN address.
const baseURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://127.0.0.1:3001');
export const { api, configureSession } = createClient(baseURL);
