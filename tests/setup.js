import { beforeEach, vi } from 'vitest';

function makeChromeMock() {
  return {
    action: {
      setIcon: vi.fn().mockResolvedValue(undefined),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

globalThis.chrome = makeChromeMock();

beforeEach(() => {
  globalThis.chrome = makeChromeMock();
});
