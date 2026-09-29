/** The original English edit stays the default; ?lang=ru selects Russian. */
export const RUSSIAN = new URLSearchParams(location.search).get('lang') === 'ru';
export const DATA_DIR = RUSSIAN ? 'data/ru' : 'data';
export const AUDIO_FILE = RUSSIAN ? 'audio/pdoom-ru-v2.m4a' : 'audio/pdoom.mp3';
