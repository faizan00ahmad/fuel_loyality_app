export const C = {
  red: '#DA291C',
  redDark: '#A81B12',
  yellow: '#FFC72C',
  ink: '#1B1B1B',
  grey: '#6B6B6B',
  line: '#E6E6E6',
  bg: '#F4F4F4',
  white: '#FFFFFF',
  green: '#1E8E3E',
  link: '#0B57A8',
  locked: '#B9B9B9',
};

export const F = {
  medium: 'Baloo2_500Medium',
  semi: 'Baloo2_600SemiBold',
  bold: 'Baloo2_700Bold',
  black: 'Baloo2_800ExtraBold',
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

export const SERVICE_ICON: Record<string, string> = {
  tyre_air: '🛞',
  puncture: '🔧',
  car_wash: '🚗',
};

export function formatDate(ts: number) {
  const d = new Date(ts);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function formatDateTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(ts)}, ${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const formatMobile = (m: string) =>
  m.length === 11 ? `${m.slice(0, 4)}-${m.slice(4)}` : m;
