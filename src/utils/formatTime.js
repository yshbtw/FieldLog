/**
 * Format seconds into HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(val => val.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Format a Date object or ISO string into a readable date (e.g. Mar 14, 2024)
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time to readable HH:MM AM/PM
 */
export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format amount as Indian Rupees (₹)
 */
export function formatCurrency(amount) {
  const safeAmount = amount || 0;
  return '₹' + safeAmount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}
