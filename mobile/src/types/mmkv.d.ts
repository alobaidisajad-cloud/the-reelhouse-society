/**
 * react-native-mmkv Type Declaration
 * 
 * Provides type declarations for react-native-mmkv when the package
 * doesn't ship its own (or when Metro can't resolve them).
 */
declare module 'react-native-mmkv' {
  export class MMKV {
    constructor(configuration?: {
      id?: string;
      path?: string;
      encryptionKey?: string;
    });
    set(key: string, value: string | number | boolean): void;
    getBoolean(key: string): boolean | undefined;
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    getBuffer(key: string): Uint8Array | undefined;
    contains(key: string): boolean;
    delete(key: string): void;
    getAllKeys(): string[];
    clearAll(): void;
    recrypt(encryptionKey: string | undefined): void;
    addOnValueChangedListener(
      onValueChanged: (key: string) => void
    ): { remove: () => void };
  }
}
