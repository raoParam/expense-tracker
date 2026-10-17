module.exports = {
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
  Share: {
    share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
  },
  Alert: {
    alert: jest.fn(),
  },
  Linking: {
    openSettings: jest.fn().mockResolvedValue(true),
  },
};
