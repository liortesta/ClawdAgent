declare module '@nut-tree/nut-js' {
  export class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }
  export const clipboard: {
    copy: (text: string) => Promise<void>;
    paste: () => Promise<string>;
    getContent: () => Promise<string>;
    setContent: (text: string) => Promise<void>;
  };
  export class Region {
    constructor(left: number, top: number, width: number, height: number);
    left: number;
    top: number;
    width: number;
    height: number;
  }
  export const mouse: {
    setPosition: (point: { x: number; y: number }) => Promise<void>;
    click: (button: any) => Promise<void>;
    doubleClick: (button: any) => Promise<void>;
    scrollDown: (amount: number) => Promise<void>;
    scrollUp: (amount: number) => Promise<void>;
    getPosition: () => Promise<{ x: number; y: number }>;
  };
  export const keyboard: {
    type: (text: string) => Promise<void>;
    pressKey: (...keys: any[]) => Promise<void>;
    releaseKey: (...keys: any[]) => Promise<void>;
  };
  export const screen: {
    width: () => Promise<number>;
    height: () => Promise<number>;
    grab: () => Promise<any>;
    grabRegion: (region: Region) => Promise<any>;
  };
  export enum Key {
    Enter, Tab, Escape, Space, Backspace, Delete,
    Up, Down, Left, Right,
    LeftControl, LeftShift, LeftAlt, LeftSuper,
    A, B, C, D, E, F, G, H, I, J, K, L, M,
    N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
    F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
  }
  export enum Button {
    LEFT, RIGHT, MIDDLE,
  }
}
