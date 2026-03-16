import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SESSIONS: '@worktime_sessions',
  SETTINGS: '@worktime_settings',
  RATES: '@worktime_rates',
  SAF_DIR: '@worktime_saf_dir',
};

/**
 * Save work sessions to local storage.
 */
export async function saveSessions(sessions) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

/**
 * Load work sessions from local storage.
 */
export async function loadSessions() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SESSIONS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading sessions:', error);
    return [];
  }
}

/**
 * Save app settings to local storage.
 */
export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Load app settings from local storage.
 */
export async function loadSettings() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error loading settings:', error);
    return {};
  }
}

/**
 * Save contact rates to local storage.
 */
export async function saveRates(rates) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.RATES, JSON.stringify(rates));
  } catch (error) {
    console.error('Error saving rates:', error);
  }
}

/**
 * Load contact rates from local storage.
 */
export async function loadRates() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RATES);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error loading rates:', error);
    return {};
  }
}

/**
 * Save SAF Directory URI to local storage.
 */
export async function saveDirectoryUri(uri) {
  try {
    if (!uri) {
      await AsyncStorage.removeItem(STORAGE_KEYS.SAF_DIR);
    } else {
      await AsyncStorage.setItem(STORAGE_KEYS.SAF_DIR, uri);
    }
  } catch (error) {
    console.error('Error saving directory URI:', error);
  }
}

/**
 * Load SAF Directory URI from local storage.
 */
export async function loadDirectoryUri() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.SAF_DIR);
  } catch (error) {
    console.error('Error loading directory URI:', error);
    return null;
  }
}

export { STORAGE_KEYS };
