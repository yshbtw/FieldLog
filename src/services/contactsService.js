import * as Contacts from 'expo-contacts';

/**
 * Request permission and fetch device contacts.
 * Returns an array of contacts or an empty array on failure.
 */
export async function fetchContacts() {
  try {
    const { status } = await Contacts.requestPermissionsAsync();

    if (status !== 'granted') {
      console.warn('Contacts permission not granted');
      return [];
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });

    return data || [];
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
}
