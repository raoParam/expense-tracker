class MockFile {
  constructor(...uris) {
    this.uri = uris.join('/');
  }

  async text() {
    return MockFile._mockContent || '';
  }

  static async pickFileAsync() {
    if (MockFile._mockCancelled) {
      return { canceled: true, result: null };
    }
    return {
      canceled: false,
      result: new MockFile('file:///mock-backup.json'),
    };
  }
}

MockFile._mockContent = '';
MockFile._mockCancelled = false;

module.exports = {
  File: MockFile,
  Paths: {
    cache: 'file:///cache',
    document: 'file:///documents',
  },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, directoryUri: 'content://downloads' }),
    createFileAsync: jest.fn().mockResolvedValue('content://downloads/spendly-backup.json'),
    writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
    readAsStringAsync: jest.fn().mockResolvedValue(''),
  },
};
