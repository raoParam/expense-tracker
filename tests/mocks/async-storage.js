let storage = {};

const asyncStorageMock = {
  setItem: jest.fn((key, value) => {
    storage[key] = String(value);
    return Promise.resolve();
  }),
  getItem: jest.fn((key) => {
    return Promise.resolve(Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null);
  }),
  removeItem: jest.fn((key) => {
    delete storage[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    storage = {};
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(storage))),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map((k) => [k, storage[k] ?? null]))),
  multiSet: jest.fn((pairs) => {
    pairs.forEach(([k, v]) => {
      storage[k] = String(v);
    });
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys) => {
    keys.forEach((k) => delete storage[k]);
    return Promise.resolve();
  }),
};

module.exports = {
  default: asyncStorageMock,
  ...asyncStorageMock,
};
