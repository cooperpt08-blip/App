import * as Location from 'expo-location';
import { Platform } from 'react-native';

// Finds a street address on the map using the phone's own map service (free).
// Returns null if the address can't be found.
export async function findOnMap(address: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!address.trim()) return null;
  try {
    if (Platform.OS === 'android') {
      // Android only allows address lookups after location permission is granted.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
    }
    const [place] = await Location.geocodeAsync(address);
    return place ? { latitude: place.latitude, longitude: place.longitude } : null;
  } catch {
    return null;
  }
}
