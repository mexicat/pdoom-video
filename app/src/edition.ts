/** The Russian branch opens the Russian edit; ?lang=en retains the original. */
export const RUSSIAN = new URLSearchParams(location.search).get('lang') !== 'en';
export const DATA_DIR = RUSSIAN ? 'data/ru' : 'data';
export const AUDIO_FILE = RUSSIAN ? 'audio/pdoom-ru-v2.m4a' : 'audio/pdoom.mp3';
