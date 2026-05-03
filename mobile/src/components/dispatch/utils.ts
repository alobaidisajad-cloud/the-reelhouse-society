const EPOCH = new Date('2026-03-12T00:00:00Z').getTime();

export const daysSinceEpoch = () => Math.floor(Date.now() / (24 * 60 * 60 * 1000));
export const volumeNumber = () => String(Math.floor((Date.now() - EPOCH) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0');
export const transmissionNum = () => String(Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000)) + 1).padStart(3, '0');
