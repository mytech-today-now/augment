describe('Interactive command imports', () => {
  it.each([
    ['gui', '../gui', 'guiCommand'],
    ['init', '../init', 'initCommand'],
    ['self-remove', '../self-remove', 'selfRemoveCommand']
  ])('loads %s without a parse-time crash', (_, modulePath, exportName) => {
    jest.resetModules();

    const loadedModule = require(modulePath);

    expect(loadedModule[exportName]).toEqual(expect.any(Function));
  });
});
